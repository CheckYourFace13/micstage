/**
 * Safely promote NEEDS_REVIEW public open mic listings to VERIFIED (public) when
 * BOTH halves of the safety rule are satisfied:
 *
 *   A) Verified place identity  -> googlePlaceId + googlePlaceVerifiedAt set
 *   B) Trusted, venue-tied open-mic evidence -> evaluateOpenMicEvidence().trusted
 *
 * Extra guard: the listing NAME must pass the shared name classifier
 * (scripts/lib/listingNameClassifier.mjs), which rejects article / listicle /
 * aggregator / directory / bare-city open-mic names ("Open Mics", "Open Mic
 * Portland", "Open Mic Nights in <city>", ...).
 *
 * Non-destructive: dry-run by default. Claimed listings are never touched.
 *
 * Usage:
 *   node scripts/promote-reviewed-open-mic-listings.mjs             # dry run (default)
 *   node scripts/promote-reviewed-open-mic-listings.mjs --apply     # write changes
 *   node scripts/promote-reviewed-open-mic-listings.mjs --apply --limit=100
 *
 * IMPORTANT: keep the evidence model in sync with
 * src/lib/publicListings/openMicEvidence.ts (scripts cannot import TS).
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 0) : undefined;

// --- Open-mic evidence model (keep in sync with src/lib/publicListings/openMicEvidence.ts) ---
const CONFIRMED_REASON = "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED";

const EXPLICIT_OPEN_MIC_PATTERN =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen[\s-]?mic\s*(?:night|signup|sign[\s-]?up)\b)|(\bopen\s+jam\b)|(\bopen\s+blues\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bsongwriter\s+(?:open\s*mic|night)\b)|(\bspoken\s+word\s+open\s*mic\b)/i;

const NON_EVIDENCE_NOISE = [
  /open[\s-]?mic venue identified from public listings and web search\.?/gi,
  /live music venue with open mic or performer signup signals\.?/gi,
  /open[\s\u2013-]?mic[\s\u2013-]*targeted nationwide discovery\.?/gi,
  /\bquery:\s*[^.]*\.?/gi,
  /\btier\s+[a-z0-9_]+\b/gi,
  /\bmarket\s+[a-z0-9-]+\b/gi,
  /discovered via [^.]*\.?/gi,
  /\[micstage_email_meta\][^.]*\.?/gi,
];
const LISTICLE_OR_ARTICLE =
  /(^\s*\d{1,3}\s*\+?\s+(best|top|great|things?|reasons?|ways?|places?|venues?|clubs?|mics?|spots?|bars?)\b)|(\bthings\s+to\s+do\b)|(\bbest\s+(live\s+music|bars|comedy|places|things)\b)|(\bguide\s+to\b)/i;
const TRUSTED_SOURCE_KINDS = new Set([
  "WEBSITE_CONTACT",
  "SOCIAL_PROFILE",
  "EVENT_LISTING",
  "CSV_IMPORT",
  "CLAUDE_CSV",
  "MANUAL_ADMIN",
]);
const HINT_EVIDENCE_KEYS = ["eventTitle", "eventDescription", "evidenceSnippet", "openMicEvidence", "pageTitle", "sourceTitle"];

function stripNonEvidenceNoise(text) {
  let t = ` ${text} `;
  for (const re of NON_EVIDENCE_NOISE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}
function explicitOpenMicMatch(text) {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}
function explicitOpenMicMatchClean(text) {
  if (!text) return null;
  return explicitOpenMicMatch(stripNonEvidenceNoise(text));
}
function hostOf(u) {
  if (!u) return null;
  try {
    return new URL(u.includes("://") ? u : `https://${u}`).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
function sourceOnVenueDomain(sourceUrl, websiteUrl) {
  const a = hostOf(sourceUrl);
  const b = hostOf(websiteUrl);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
function collectHintEvidenceStrings(hints) {
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return [];
  const out = [];
  for (const k of HINT_EVIDENCE_KEYS) {
    const v = hints[k];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}
function extractDiscoverySnippet(internalNotes) {
  if (!internalNotes) return null;
  const idx = internalNotes.indexOf("Snippet:");
  if (idx === -1) return null;
  let s = internalNotes.slice(idx + "Snippet:".length).trim();
  s = s.replace(/Page fetch failed[^.]*\.?/i, "").replace(/scored from SERP only\.?/i, "").trim();
  s = s.replace(/^["'\s]+|["'\s.]+$/g, "").trim();
  return s.length >= 3 ? s : null;
}
function evaluateOpenMicEvidence(input) {
  const kindTrusted = input.sourceKind && TRUSTED_SOURCE_KINDS.has(input.sourceKind);
  const onDomain = sourceOnVenueDomain(input.sourceUrl, input.websiteUrl);
  const validName = !!input.listingName && isPublicListingNameOk(input.listingName);
  const structuredTrust = validName && (kindTrusted || onDomain);

  const nameMatch = validName ? explicitOpenMicMatch(input.listingName) : null;
  if (nameMatch) return { hasEvidence: true, trusted: true, field: "name", snippet: nameMatch };

  for (const s of input.schedules ?? []) {
    const text = [s.title, s.description].filter(Boolean).join(" — ");
    const m = explicitOpenMicMatchClean(text);
    if (m) return { hasEvidence: true, trusted: true, field: "schedule", snippet: m };
  }

  let untrusted = null;
  const candidates = [];
  for (const t of collectHintEvidenceStrings(input.discoveryHints)) candidates.push({ field: "discoveryHints", text: t, titleLike: true, canTrust: structuredTrust });
  if (input.sourceSnippet) candidates.push({ field: "sourceSnippet", text: input.sourceSnippet, titleLike: false, canTrust: false });

  for (const c of candidates) {
    if (c.titleLike && LISTICLE_OR_ARTICLE.test(c.text)) continue;
    const m = explicitOpenMicMatchClean(c.text);
    if (!m) continue;
    const res = { hasEvidence: true, trusted: c.canTrust, field: c.field, snippet: m };
    if (res.trusted) return res;
    if (!untrusted) untrusted = res;
  }
  return untrusted ?? { hasEvidence: false, trusted: false, field: null, snippet: null };
}

function buildEvidenceInput(row) {
  return {
    listingName: row.name,
    schedules: row.schedules,
    sourceSnippet: extractDiscoverySnippet(row.growthLead?.internalNotes),
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: row.growthLead?.sourceKind ?? null,
  };
}

// Promotion-only name guard now delegates to the shared classifier
// (scripts/lib/listingNameClassifier.mjs), which rejects article / listicle /
// aggregator / directory / bare-city open-mic names.
function isPromotableVenueName(name) {
  return isPublicListingNameOk((name ?? "").trim());
}

function appendNote(existing, reason) {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] promote: ${reason}`;
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: "NEEDS_REVIEW",
      googlePlaceId: { not: null },
      googlePlaceVerifiedAt: { not: null },
    },
    orderBy: [{ updatedAt: "desc" }],
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      internalNotes: true,
      sourceUrl: true,
      websiteUrl: true,
      schedules: { select: { title: true, description: true } },
      growthLead: { select: { sourceKind: true, internalNotes: true, discoveryHints: true } },
    },
  });

  let promoted = 0;
  let skippedName = 0;
  let skippedEvidence = 0;
  const byField = {};

  for (const row of rows) {
    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    if (!evidence.trusted) {
      skippedEvidence += 1;
      continue;
    }
    if (!isPromotableVenueName(row.name)) {
      skippedName += 1;
      continue;
    }
    promoted += 1;
    byField[evidence.field] = (byField[evidence.field] ?? 0) + 1;

    if (!apply) {
      console.log(`[dry-run] VERIFIED  ${row.slug.padEnd(46)} [${evidence.field}]  ${row.name}`);
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
        internalNotes: appendNote(
          row.internalNotes,
          `${CONFIRMED_REASON} (${evidence.field}: "${evidence.snippet}"); place identity confirmed`,
        ),
      },
    });
    console.log(`VERIFIED  ${row.slug.padEnd(46)} [${evidence.field}]  ${row.name}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        scannedPlaceConfirmedNeedsReview: rows.length,
        promoted,
        skippedNoTrustedEvidence: skippedEvidence,
        skippedNonVenueName: skippedName,
        byEvidenceField: byField,
        limit: limit ?? null,
      },
      null,
      2,
    ),
  );
  if (!apply && promoted > 0) {
    console.log("\nDry run only. Re-run with --apply to promote these to VERIFIED (public).");
  }
} finally {
  await prisma.$disconnect();
}
