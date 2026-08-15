/**
 * Snapshot evidence strength for all public VERIFIED unclaimed listings.
 * Uses ListingOpenMicEvidence rows + name/schedule + age/conflict signals.
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { isPublicListingNameOk } from "./lib/listingNameClassifier.mjs";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const EXPLICIT =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bopen\s+singer[\s-]?songwriter\b)|(\bsinger[\s-]?songwriter\s+(?:open\s*mic|night)\b)/i;
const CANCELLED =
  /\b(cancelled|canceled|permanently\s+closed|no\s+longer\s+(?:running|happening)|final\s+night|postponed\s+indefinitely)\b/i;
const RECURRING =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|each\s+week|first\s+(monday|tuesday|wednesday|thursday|friday)|every\s+other)\b/i;
const HISTORICAL =
  /\b(archive|archived|looking\s+back|in\s+20(0\d|1\d|2[0-3])\b|formerly|used\s+to\s+(?:host|run)|past\s+events?)\b/i;
const WEAK_LIVE =
  /\b(live\s+music|music\s+venue|concerts?|shows?\s+nightly|entertainment)\b/i;

/** Age thresholds (days) — lenient for recurring weekly events. */
const FRESH_DAYS = 540; // ~18 months
const AGED_MAX_DAYS = 1095; // ~36 months — still public if recurring/strong, else refresh

function daysSince(d) {
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000);
}

function classify(row) {
  const hay = [
    row.name,
    row.about,
    row.internalNotes,
    row.sourceName,
    ...(row.schedules ?? []).flatMap((s) => [s.title, s.description]),
    ...(row.openMicEvidenceRows ?? []).flatMap((e) => [e.detectedPhrase, e.evidenceExcerpt, e.evidenceTitle, e.reasonCode]),
  ]
    .filter(Boolean)
    .join("\n");

  if (CANCELLED.test(hay) || /PLACE_OR_REGION_CONFLICT|OFFICIAL_CANCELLED/i.test(hay)) {
    return { bucket: "CONFLICTED", eligibility: "CONFLICTED", reason: "cancellation_or_conflict" };
  }

  const trustedRows = (row.openMicEvidenceRows ?? []).filter((e) => e.trusted);
  const anyRows = row.openMicEvidenceRows ?? [];
  const nameOk = isPublicListingNameOk(row.name);
  const nameExplicit = nameOk && EXPLICIT.test(row.name);
  const scheduleExplicit = (row.schedules ?? []).some((s) => EXPLICIT.test([s.title, s.description].filter(Boolean).join(" ")));
  const scheduleRecurring = (row.schedules ?? []).some((s) => s.isActive && s.weekday);
  const excerptRecurring = RECURRING.test(hay) || scheduleRecurring;
  const historical = HISTORICAL.test(hay) && !excerptRecurring;

  const bestFetched = [...trustedRows, ...anyRows]
    .map((e) => e.fetchedAt || e.evidenceDate)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const ageDays = daysSince(bestFetched) ?? daysSince(row.lastVerifiedAt) ?? daysSince(row.googlePlaceVerifiedAt);

  if (historical && !nameExplicit && !scheduleExplicit && trustedRows.length === 0) {
    return { bucket: "CONFLICTED", eligibility: "NOT_AN_OPEN_MIC", reason: "historical_only" };
  }

  const hasTrustedStored = trustedRows.length > 0;
  const hasExplicit = nameExplicit || scheduleExplicit || hasTrustedStored || anyRows.some((e) => e.detectedPhrase);

  if (!hasExplicit) {
    if (WEAK_LIVE.test(hay)) {
      return { bucket: "WEAK", eligibility: "NEEDS_EVIDENCE", reason: "live_music_only" };
    }
    return { bucket: "NONE", eligibility: "NEEDS_EVIDENCE", reason: "place_only_no_open_mic" };
  }

  // Third-party only (has evidence rows but none trusted, no name/schedule explicit)
  if (!nameExplicit && !scheduleExplicit && !hasTrustedStored && anyRows.some((e) => e.detectedPhrase)) {
    const thirdFresh = ageDays != null && ageDays <= FRESH_DAYS;
    return {
      bucket: thirdFresh ? "THIRD_PARTY_CURRENT" : "WEAK",
      eligibility: "NEEDS_EVIDENCE",
      reason: "third_party_only",
      ageDays,
    };
  }

  // Strong via name, schedule, or trusted stored evidence
  const strong = nameExplicit || scheduleExplicit || hasTrustedStored;
  if (!strong) {
    return { bucket: "WEAK", eligibility: "NEEDS_EVIDENCE", reason: "untrusted_or_ambiguous" };
  }

  if (ageDays != null && ageDays > AGED_MAX_DAYS && !scheduleRecurring) {
    return {
      bucket: "STRONG_RECURRING_BUT_AGED",
      eligibility: "PUBLIC_OPEN_MIC_AGED",
      reason: "evidence_stale_over_36mo",
      ageDays,
    };
  }
  if (ageDays != null && ageDays > FRESH_DAYS) {
    return {
      bucket: "STRONG_RECURRING_BUT_AGED",
      eligibility: excerptRecurring || scheduleRecurring || nameExplicit ? "PUBLIC_OPEN_MIC_AGED" : "NEEDS_EVIDENCE",
      reason: "evidence_aging_18mo_plus",
      ageDays,
      remainPublic: excerptRecurring || scheduleRecurring || nameExplicit,
    };
  }

  return {
    bucket: "STRONG_CURRENT",
    eligibility: "PUBLIC_OPEN_MIC_CONFIRMED",
    reason: nameExplicit ? "name_explicit" : scheduleExplicit ? "schedule_explicit" : "trusted_evidence_row",
    ageDays,
  };
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

const rows = await prisma.publicOpenMicListing.findMany({
  where: { verificationStatus: "VERIFIED", claimedVenueId: null },
  select: {
    id: true,
    slug: true,
    name: true,
    about: true,
    internalNotes: true,
    sourceName: true,
    lastVerifiedAt: true,
    googlePlaceVerifiedAt: true,
    claimInviteEmailSentAt: true,
    claimInviteEmail: true,
    schedules: { select: { title: true, description: true, weekday: true, isActive: true } },
    openMicEvidenceRows: {
      select: {
        trusted: true,
        reviewOnly: true,
        detectedPhrase: true,
        evidenceExcerpt: true,
        evidenceTitle: true,
        reasonCode: true,
        fetchedAt: true,
        evidenceDate: true,
        currentnessScore: true,
        authorityScore: true,
        sourceType: true,
      },
    },
  },
});

const buckets = {
  STRONG_CURRENT: [],
  STRONG_RECURRING_BUT_AGED: [],
  THIRD_PARTY_CURRENT: [],
  WEAK: [],
  NONE: [],
  CONFLICTED: [],
};

for (const row of rows) {
  const c = classify(row);
  buckets[c.bucket].push({ ...row, classification: c });
}

const total = rows.length;
function pct(n) {
  return total ? `${((100 * n) / total).toFixed(1)}%` : "0%";
}

const remainPublic = [
  ...buckets.STRONG_CURRENT,
  ...buckets.STRONG_RECURRING_BUT_AGED.filter((r) => r.classification.eligibility === "PUBLIC_OPEN_MIC_AGED" || r.classification.remainPublic !== false),
];
const hideNow = [...buckets.WEAK, ...buckets.NONE, ...buckets.CONFLICTED, ...buckets.THIRD_PARTY_CURRENT];
const refresh = buckets.STRONG_RECURRING_BUT_AGED.filter((r) => r.classification.eligibility === "PUBLIC_OPEN_MIC_AGED");

console.log(
  JSON.stringify(
    {
      total,
      counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
      percents: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, pct(v.length)])),
      wouldRemainPublic: remainPublic.length,
      wouldRefreshQueue: refresh.length,
      wouldHideOrHold: hideNow.length,
    },
    null,
    2,
  ),
);

console.log("\n--- sample STRONG_CURRENT (25) ---");
for (const r of buckets.STRONG_CURRENT.slice(0, 25)) {
  console.log(`  KEEP  ${r.slug.padEnd(40)} ${JSON.stringify(r.name)} [${r.classification.reason}]`);
}
console.log("\n--- sample HIDE/HOLD (25) ---");
for (const r of hideNow.slice(0, 25)) {
  console.log(
    `  ${r.classification.bucket.padEnd(22)} ${r.slug.padEnd(40)} ${JSON.stringify(r.name)} [${r.classification.reason}]`,
  );
}
console.log("\n--- recently invited (60d) among hide ---");
const since = Date.now() - 60 * 24 * 60 * 60 * 1000;
const invitedHide = hideNow.filter((r) => r.claimInviteEmailSentAt && r.claimInviteEmailSentAt.getTime() >= since);
console.log("invited-but-insufficient", invitedHide.length);
for (const r of invitedHide.slice(0, 15)) {
  console.log(`  ${r.classification.bucket.padEnd(22)} ${r.slug} ${JSON.stringify(r.name)}`);
}

console.log("\n--- recently invited (60d) evidence ---");
const invited = rows.filter((r) => r.claimInviteEmailSentAt && r.claimInviteEmailSentAt.getTime() >= since);
const invBuckets = {};
for (const r of invited) {
  const c = classify(r);
  invBuckets[c.bucket] = (invBuckets[c.bucket] || 0) + 1;
}
console.log({ invited: invited.length, invBuckets });

await prisma.$disconnect();
