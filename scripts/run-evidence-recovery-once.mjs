/**
 * One-shot evidence recovery: Google-verify held listings, then enrich with
 * official event-path crawling. Does not loosen the evidence gate.
 *
 * Usage: npx tsx scripts/run-evidence-recovery-once.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { verifyPublicListingsWithGoogle } from "../src/lib/publicListings/googlePlacesVerify.ts";
import { enrichListingsMissingTrustedEvidence } from "../src/lib/publicListings/evidenceEnrichment.ts";
import { isPublicListingNameOk } from "../scripts/lib/listingNameClassifier.mjs";

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

process.env.LISTING_GOOGLE_VERIFY_PER_RUN = process.env.LISTING_GOOGLE_VERIFY_PER_RUN || "60";
process.env.LISTING_EVIDENCE_ENRICH_PER_RUN = process.env.LISTING_EVIDENCE_ENRICH_PER_RUN || "50";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const beforeVerified = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "VERIFIED", claimedVenueId: null },
});
const beforeHeld = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "NEEDS_REVIEW", claimedVenueId: null },
});

// Reset backoff so place-verified held rows are immediately enrichable.
await prisma.publicOpenMicListing.updateMany({
  where: {
    verificationStatus: "NEEDS_REVIEW",
    claimedVenueId: null,
    googlePlaceId: { not: null },
    googlePlaceVerifiedAt: { not: null },
    evidenceEnrichAttemptCount: { lt: 5 },
  },
  data: {
    evidenceEnrichNextAttemptAt: new Date(),
    evidenceAutomationStatus: "PENDING",
  },
});

// OUTDATE display-quality junk in held queue (deterministic).
const heldForName = await prisma.publicOpenMicListing.findMany({
  where: { verificationStatus: "NEEDS_REVIEW", claimedVenueId: null },
  select: { id: true, name: true, internalNotes: true },
});
let outdatedJunk = 0;
for (const row of heldForName) {
  if (isPublicListingNameOk(row.name)) continue;
  await prisma.publicOpenMicListing.update({
    where: { id: row.id },
    data: {
      verificationStatus: "OUTDATED",
      evidenceAutomationStatus: "REJECTED",
      evidenceTerminalReason: "NAME_CLASSIFIER_BLOCKED",
      internalNotes: `${row.internalNotes ?? ""}\n[${new Date().toISOString().slice(0, 10)}] recovery:OUTDATED display_quality`.trim(),
    },
  });
  outdatedJunk += 1;
}

console.log(JSON.stringify({ phase: "start", beforeVerified, beforeHeld, outdatedJunk }, null, 2));

const verify = await verifyPublicListingsWithGoogle(prisma, { limit: 60 });
console.log(JSON.stringify({ phase: "google_verify", ...verify }, null, 2));

const enrich = await enrichListingsMissingTrustedEvidence(prisma, { limit: 50 });
console.log(JSON.stringify({ phase: "evidence_enrich", ...enrich }, null, 2));

const afterVerified = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "VERIFIED", claimedVenueId: null },
});
const afterHeld = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "NEEDS_REVIEW", claimedVenueId: null },
});
const afterOutdated = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "OUTDATED", claimedVenueId: null },
});

console.log(
  JSON.stringify(
    {
      phase: "done",
      beforeVerified,
      afterVerified,
      rePromotedApprox: Math.max(0, afterVerified - beforeVerified),
      beforeHeld,
      afterHeld,
      afterOutdated,
      outdatedJunk,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
