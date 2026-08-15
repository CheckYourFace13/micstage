/**
 * Historical active claim-invite token audit (report only — no revoke/resend).
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

const now = new Date();
const tokens = await prisma.listingClaimInviteToken.findMany({
  where: { status: "ACTIVE", expiresAt: { gt: now } },
  select: {
    id: true,
    createdAt: true,
    expiresAt: true,
    listing: {
      select: {
        slug: true,
        name: true,
        verificationStatus: true,
        claimedVenueId: true,
        googlePlaceId: true,
        websiteUrl: true,
        sourceUrl: true,
        schedules: { select: { title: true, description: true } },
      },
    },
  },
});

const EXPLICIT = /\bopen[\s-]?mic|\bopen[\s-]?mike|\bopen\s+jam|\bopen\s+stage|\bjam\s+night/i;

function hasEvidence(l) {
  if (!l) return false;
  if (isPublicListingNameOk(l.name) && EXPLICIT.test(l.name)) return true;
  return (l.schedules ?? []).some((s) => EXPLICIT.test([s.title, s.description].filter(Boolean).join(" ")));
}

const buckets = {
  total: tokens.length,
  listingStillPublicVerified: 0,
  listingNeedsReview: 0,
  listingOutdatedOrMissing: 0,
  listingClaimed: 0,
  displayQualityBad: 0,
  evidenceStrong: 0,
  evidenceWeakOrNone: 0,
  expiresWithin7d: 0,
  ageOver30d: 0,
};

const week = 7 * 24 * 3600 * 1000;
const month = 30 * 24 * 3600 * 1000;

for (const t of tokens) {
  const l = t.listing;
  const age = now - t.createdAt.getTime();
  if (age > month) buckets.ageOver30d += 1;
  if (t.expiresAt.getTime() - now.getTime() < week) buckets.expiresWithin7d += 1;
  if (!l) {
    buckets.listingOutdatedOrMissing += 1;
    continue;
  }
  if (l.claimedVenueId) buckets.listingClaimed += 1;
  if (l.verificationStatus === "VERIFIED" && !l.claimedVenueId) buckets.listingStillPublicVerified += 1;
  else if (l.verificationStatus === "NEEDS_REVIEW") buckets.listingNeedsReview += 1;
  else buckets.listingOutdatedOrMissing += 1;
  if (!isPublicListingNameOk(l.name)) buckets.displayQualityBad += 1;
  if (hasEvidence(l)) buckets.evidenceStrong += 1;
  else buckets.evidenceWeakOrNone += 1;
}

console.log(JSON.stringify(buckets, null, 2));
await prisma.$disconnect();
