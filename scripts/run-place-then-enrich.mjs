/**
 * Bounded place-verify recovery for held listings stuck on max attempts.
 * Only resets backoff for NEEDS_REVIEW rows with a website and attempt count >= 3.
 * Usage: npx tsx scripts/run-place-then-enrich.mjs
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

process.env.LISTING_GOOGLE_VERIFY_PER_RUN = "50";
process.env.LISTING_EVIDENCE_ENRICH_PER_RUN = "40";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const candidates = await prisma.publicOpenMicListing.findMany({
  where: {
    verificationStatus: "NEEDS_REVIEW",
    claimedVenueId: null,
    googlePlaceId: null,
    websiteUrl: { not: null },
  },
  select: { id: true, name: true, placeVerifyAttemptCount: true },
  take: 120,
  orderBy: { updatedAt: "desc" },
});

const resetIds = candidates.filter((r) => isPublicListingNameOk(r.name)).map((r) => r.id);
if (resetIds.length) {
  await prisma.publicOpenMicListing.updateMany({
    where: { id: { in: resetIds } },
    data: {
      placeVerifyAttemptCount: 0,
      placeVerifyNextAttemptAt: new Date(),
    },
  });
}
console.log(JSON.stringify({ candidates: candidates.length, resetForVerify: resetIds.length }));

const beforeV = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "VERIFIED", claimedVenueId: null },
});
const beforeH = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "NEEDS_REVIEW", claimedVenueId: null },
});

const verify = await verifyPublicListingsWithGoogle(prisma, { limit: 50 });
console.log(JSON.stringify({ verify }));

// Make newly place-verified rows enrichable immediately
await prisma.publicOpenMicListing.updateMany({
  where: {
    verificationStatus: "NEEDS_REVIEW",
    claimedVenueId: null,
    googlePlaceId: { not: null },
    googlePlaceVerifiedAt: { not: null },
    evidenceEnrichAttemptCount: { lt: 6 },
  },
  data: {
    evidenceEnrichNextAttemptAt: new Date(),
    evidenceAutomationStatus: "PENDING",
    // allow one more enrich pass even if previously exhausted
    evidenceEnrichAttemptCount: 0,
  },
});

const enrich = await enrichListingsMissingTrustedEvidence(prisma, { limit: 40 });
console.log(JSON.stringify({ enrich }));

const afterV = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "VERIFIED", claimedVenueId: null },
});
const afterH = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "NEEDS_REVIEW", claimedVenueId: null },
});
const heldWithPlace = await prisma.publicOpenMicListing.count({
  where: {
    verificationStatus: "NEEDS_REVIEW",
    claimedVenueId: null,
    googlePlaceId: { not: null },
    googlePlaceVerifiedAt: { not: null },
  },
});

console.log(JSON.stringify({ beforeV, afterV, beforeH, afterH, heldWithPlace, deltaV: afterV - beforeV }));

await prisma.$disconnect();
await pool.end();
