/**
 * Audit public display quality for unclaimed PublicOpenMicListing rows.
 *
 * Uses classifyPublicDisplayQuality from the shared JS classifier
 * (scripts/lib/listingNameClassifier.mjs), which mirrors
 * src/lib/publicListings/listingQuality.ts.
 *
 * Usage:
 *   node scripts/audit-public-display-quality.mjs            # dry run (default)
 *   node scripts/audit-public-display-quality.mjs --apply    # write BAD + TITLE_CLEANUP changes
 *
 * --apply rules:
 *   - BAD only → verificationStatus=OUTDATED + append internalNotes
 *     `[date] public_display_quality:BAD:REASON` (never touch claimed)
 *   - TITLE_CLEANUP with canonicalName → set name=canonicalName + note with
 *     original source title (do NOT change verificationStatus)
 *   - AMBIGUOUS → never auto-changed
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { classifyPublicDisplayQuality } from "./lib/listingNameClassifier.mjs";

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

/** Known titles from the public-display quality audit brief — flag if present. */
const KNOWN_AUDIT_EXAMPLES = [
  "Instagram",
  "Must",
  "Open",
  "Find Events & Groups in Brooklyn New York NY",
  "Find Events & Groups in Navi Mumbai IN",
  "Open Mic Night Music Tickets Multiple dates",
  "Step on the stage Comedians poets...",
  "Looking for Live Music in KC...",
  "Meet Our Song Creators",
  "StoreFM",
  "Celebrate Poetry in Chicago for National Poetry Month",
  "spectrum center charlotte",
  "10 best live music venues in charlotte, nc",
  "12 best comedy clubs in dallas for a night of laughs",
  "14 open mics to try standup comedy in dc",
  "24 things to do in the rockford area this weekend",
].map((s) => s.toLowerCase());

function redactEmail(email) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return "[redacted]";
  const at = e.indexOf("@");
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const localRedacted = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${localRedacted}@${domain}`;
}

function appendNote(existing, line) {
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

function stampDate() {
  return new Date().toISOString().slice(0, 10);
}

function pct(n, total) {
  if (!total) return "0.0%";
  return `${((100 * n) / total).toFixed(1)}%`;
}

function printSample(label, rows, limit) {
  console.log(`\n--- sample ${label} (up to ${limit}) ---`);
  for (const row of rows.slice(0, limit)) {
    const canon = row.quality.canonicalName ? ` → ${JSON.stringify(row.quality.canonicalName)}` : "";
    console.log(
      `  [${row.quality.reason ?? "-"}] ${row.slug}  ${JSON.stringify(row.name)}${canon}`,
    );
  }
  if (!rows.length) console.log("  (none)");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const select = {
    id: true,
    slug: true,
    name: true,
    city: true,
    region: true,
    formattedAddress: true,
    googlePlaceId: true,
    verificationStatus: true,
    claimedVenueId: true,
    internalNotes: true,
    claimInviteEmailSentAt: true,
    claimInviteEmail: true,
  };

  const verifiedUnclaimed = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      claimedVenueId: null,
    },
    orderBy: { updatedAt: "desc" },
    select,
  });

  const needsReviewUnclaimed = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "NEEDS_REVIEW",
      claimedVenueId: null,
    },
    orderBy: { updatedAt: "desc" },
    select,
  });

  function bucketRows(rows) {
    const buckets = {
      GOOD: [],
      TITLE_CLEANUP: [],
      AMBIGUOUS: [],
      BAD: [],
    };
    const knownFlags = [];
    for (const row of rows) {
      const quality = classifyPublicDisplayQuality({
        name: row.name,
        city: row.city,
        region: row.region,
        formattedAddress: row.formattedAddress,
        googlePlaceId: row.googlePlaceId,
      });
      const enriched = { ...row, quality };
      buckets[quality.bucket].push(enriched);
      const nameKey = (row.name ?? "").trim().toLowerCase();
      if (KNOWN_AUDIT_EXAMPLES.includes(nameKey)) {
        knownFlags.push(enriched);
      } else {
        // Also flag partial / ellipsis-style known examples by prefix match.
        for (const known of KNOWN_AUDIT_EXAMPLES) {
          const stem = known.replace(/\.\.\.$/, "").trim();
          if (stem.length >= 12 && nameKey.startsWith(stem)) {
            knownFlags.push(enriched);
            break;
          }
        }
      }
    }
    return { buckets, knownFlags };
  }

  const verified = bucketRows(verifiedUnclaimed);
  const needsReview = bucketRows(needsReviewUnclaimed);

  const total = verifiedUnclaimed.length;
  console.log("\n=== VERIFIED + unclaimed public display quality ===");
  console.log(`scanned: ${total}`);
  for (const key of ["GOOD", "TITLE_CLEANUP", "AMBIGUOUS", "BAD"]) {
    const n = verified.buckets[key].length;
    console.log(`  ${key.padEnd(14)} ${String(n).padStart(6)}  ${pct(n, total)}`);
  }

  printSample("GOOD", verified.buckets.GOOD, 25);
  printSample("BAD", verified.buckets.BAD, 25);
  printSample("TITLE_CLEANUP", verified.buckets.TITLE_CLEANUP, 20);

  if (verified.knownFlags.length) {
    console.log(`\n--- known audit examples flagged (${verified.knownFlags.length}) ---`);
    for (const row of verified.knownFlags) {
      console.log(
        `  ${row.quality.bucket.padEnd(14)} [${row.quality.reason ?? "-"}] ${row.slug}  ${JSON.stringify(row.name)}`,
      );
    }
  } else {
    console.log("\n--- known audit examples flagged: none in VERIFIED unclaimed ---");
  }

  // Optional NEEDS_REVIEW report (separate, not applied).
  const nrTotal = needsReviewUnclaimed.length;
  console.log("\n=== NEEDS_REVIEW + unclaimed (report only; not applied) ===");
  console.log(`scanned: ${nrTotal}`);
  for (const key of ["GOOD", "TITLE_CLEANUP", "AMBIGUOUS", "BAD"]) {
    const n = needsReview.buckets[key].length;
    console.log(`  ${key.padEnd(14)} ${String(n).padStart(6)}  ${pct(n, nrTotal)}`);
  }

  // Recent claim invites (last 60 days) — quality buckets, redacted emails.
  const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const recentInvites = await prisma.publicOpenMicListing.findMany({
    where: {
      claimInviteEmailSentAt: { not: null, gte: since60 },
    },
    orderBy: { claimInviteEmailSentAt: "desc" },
    select: {
      ...select,
      claimedVenueId: true,
    },
  });

  const inviteBuckets = { GOOD: 0, TITLE_CLEANUP: 0, AMBIGUOUS: 0, BAD: 0 };
  console.log(`\n=== Recent claim invites (last 60 days): ${recentInvites.length} ===`);
  for (const row of recentInvites) {
    const quality = classifyPublicDisplayQuality({
      name: row.name,
      city: row.city,
      region: row.region,
      formattedAddress: row.formattedAddress,
      googlePlaceId: row.googlePlaceId,
    });
    inviteBuckets[quality.bucket] += 1;
    console.log(
      `  ${quality.bucket.padEnd(14)} [${(quality.reason ?? "-").slice(0, 28).padEnd(28)}] ` +
        `${row.slug.padEnd(36)} ` +
        `sent=${row.claimInviteEmailSentAt?.toISOString()?.slice(0, 10) ?? "?"} ` +
        `to=${redactEmail(row.claimInviteEmail)} ` +
        `claimed=${row.claimedVenueId ? "yes" : "no"} ` +
        `${JSON.stringify(row.name).slice(0, 80)}`,
    );
  }
  console.log("invite quality totals:", inviteBuckets);

  // Active claim-invite tokens on BAD VERIFIED unclaimed listings (if table exists).
  let badActiveTokenCount = null;
  const badIds = verified.buckets.BAD.map((r) => r.id);
  try {
    if (badIds.length && prisma.listingClaimInviteToken) {
      badActiveTokenCount = await prisma.listingClaimInviteToken.count({
        where: {
          listingId: { in: badIds },
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
      });
      console.log(
        `\nActive claim-invite tokens on BAD VERIFIED unclaimed listings: ${badActiveTokenCount} (across ${badIds.length} BAD rows)`,
      );
    } else {
      console.log("\nActive claim-invite tokens on BAD: 0 (no BAD rows or token model unavailable)");
      badActiveTokenCount = 0;
    }
  } catch (err) {
    console.log(`\nActive claim-invite token count skipped (table/model unavailable): ${err?.message ?? err}`);
  }

  let appliedBad = 0;
  let appliedCleanup = 0;
  let skippedAmbiguous = verified.buckets.AMBIGUOUS.length;

  if (apply) {
    console.log("\n=== APPLY ===");
    for (const row of verified.buckets.BAD) {
      if (row.claimedVenueId) continue;
      const reason = row.quality.reason ?? "UNKNOWN";
      const note = `[${stampDate()}] public_display_quality:BAD:${reason}`;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          internalNotes: appendNote(row.internalNotes, note),
        },
      });
      appliedBad += 1;
      console.log(`OUTDATED  ${row.slug.padEnd(40)} ${reason}  ${row.name}`);
    }

    // Deterministic BAD in NEEDS_REVIEW should not pile up indefinitely.
    for (const row of needsReview.buckets.BAD) {
      if (row.claimedVenueId) continue;
      const reason = row.quality.reason ?? "UNKNOWN";
      const note = `[${stampDate()}] public_display_quality:BAD:${reason}`;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          internalNotes: appendNote(row.internalNotes, note),
        },
      });
      appliedBad += 1;
      console.log(`OUTDATED  ${row.slug.padEnd(40)} ${reason}  ${row.name}`);
    }

    for (const row of verified.buckets.TITLE_CLEANUP) {
      if (row.claimedVenueId) continue;
      const canonical = row.quality.canonicalName;
      if (!canonical) continue;
      // Conservative: only rename when cleanup clearly removes platform fluff and
      // the result still looks like a venue/open-mic (not a truncated stub).
      if (canonical.trim().split(/\s+/).length < 3) continue;
      if (/\b(upcoming|ticketed|special|production|events?)\s*$/i.test(canonical)) continue;
      const note = `[${stampDate()}] public_display_quality:TITLE_CLEANUP original=${JSON.stringify(row.name)}`;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          name: canonical,
          internalNotes: appendNote(row.internalNotes, note),
        },
      });
      appliedCleanup += 1;
      console.log(`RENAME    ${row.slug.padEnd(40)} ${JSON.stringify(row.name)} → ${JSON.stringify(canonical)}`);
    }
    console.log(`AMBIGUOUS left untouched: ${skippedAmbiguous}`);
  } else {
    console.log(
      `\nDry run only. Would OUTDATE ${verified.buckets.BAD.length} BAD and rename ${verified.buckets.TITLE_CLEANUP.filter((r) => r.quality.canonicalName).length} TITLE_CLEANUP. Re-run with --apply to write.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        verifiedUnclaimed: {
          scanned: total,
          GOOD: verified.buckets.GOOD.length,
          TITLE_CLEANUP: verified.buckets.TITLE_CLEANUP.length,
          AMBIGUOUS: verified.buckets.AMBIGUOUS.length,
          BAD: verified.buckets.BAD.length,
          knownFlags: verified.knownFlags.length,
        },
        needsReviewUnclaimed: {
          scanned: nrTotal,
          GOOD: needsReview.buckets.GOOD.length,
          TITLE_CLEANUP: needsReview.buckets.TITLE_CLEANUP.length,
          AMBIGUOUS: needsReview.buckets.AMBIGUOUS.length,
          BAD: needsReview.buckets.BAD.length,
        },
        recentClaimInvites60d: {
          total: recentInvites.length,
          buckets: inviteBuckets,
        },
        badActiveClaimInviteTokens: badActiveTokenCount,
        applied: apply ? { badOutdated: appliedBad, titleCleanupRenamed: appliedCleanup } : null,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
