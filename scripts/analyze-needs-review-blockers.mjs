/**
 * Assign primary blocker reasons to all NEEDS_REVIEW public listings (read-only).
 * Usage: node scripts/analyze-needs-review-blockers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { classifyListingName, isPublicListingNameOk } from "./lib/listingNameClassifier.mjs";

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

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const CONFIRMED = "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED";
const UNTRUSTED = "OPEN_MIC_EVIDENCE_UNTRUSTED";
const PLACE_ONLY = "PLACE_ONLY";

function primaryBlocker(row) {
  const secondary = [];
  const nameReason = classifyListingName(row.name);
  if (nameReason === "CANCELLED_OR_CLOSED") return { primary: "CANCELLED_OR_OUTDATED", secondary };
  if (nameReason === "AGGREGATOR_OR_DIRECTORY" || nameReason === "ARTICLE_OR_LISTICLE" || nameReason === "GENERIC_PAGE_TITLE") {
    return { primary: "GENERIC_OR_AGGREGATOR_NAME", secondary: [nameReason] };
  }
  if (nameReason) secondary.push(nameReason);

  if (!row.name?.trim() || row.name.trim().length < 4) {
    return { primary: "MISSING_VENUE_IDENTITY", secondary };
  }
  if (!row.city && !row.region && !row.formattedAddress && row.lat == null) {
    secondary.push("MISSING_LOCATION");
  }

  const notes = row.internalNotes ?? "";
  if (/duplicate google place/i.test(notes)) return { primary: "DUPLICATE_GOOGLE_PLACE", secondary };
  if (/duplicate listing/i.test(notes)) return { primary: "DUPLICATE_LISTING", secondary };

  const hasPlace = Boolean(row.googlePlaceId && row.googlePlaceVerifiedAt);
  const trustedEvidence = notes.includes(CONFIRMED);
  const untrusted = notes.includes(UNTRUSTED) || /untrusted evidence/i.test(notes);
  const placeOnly = notes.includes(PLACE_ONLY) || /place only/i.test(notes);
  const serpOnly = /scored from SERP only|snippet:/i.test(notes) && !trustedEvidence;

  if (!hasPlace && !row.googlePlaceId) {
    return { primary: "GOOGLE_PLACE_NOT_ATTEMPTED", secondary };
  }
  if (!hasPlace && row.googlePlaceId) {
    return { primary: "GOOGLE_PLACE_WEAK_MATCH", secondary };
  }
  if (hasPlace && trustedEvidence && isPublicListingNameOk(row.name)) {
    return { primary: "SAFE_PROMOTION_ELIGIBLE", secondary };
  }
  if (hasPlace && (untrusted || placeOnly || serpOnly)) {
    if (serpOnly) secondary.push("SOURCE_ONLY_SERP_SNIPPET");
    if (!row.websiteUrl) secondary.push("OFFICIAL_WEBSITE_NOT_FOUND");
    return { primary: "TRUSTED_OPEN_MIC_EVIDENCE_MISSING", secondary };
  }
  if (hasPlace && !trustedEvidence) {
    if (!row.websiteUrl) secondary.push("OFFICIAL_WEBSITE_NOT_FOUND");
    return { primary: "TRUSTED_OPEN_MIC_EVIDENCE_MISSING", secondary };
  }
  if (hasPlace) return { primary: "GOOGLE_PLACE_STRONG_MATCH", secondary };
  return { primary: "MANUAL_AMBIGUITY", secondary };
}

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: { verificationStatus: "NEEDS_REVIEW" },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      lat: true,
      websiteUrl: true,
      googlePlaceId: true,
      googlePlaceVerifiedAt: true,
      internalNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const byPrimary = {};
  const samples = {};
  for (const row of rows) {
    const { primary, secondary } = primaryBlocker(row);
    byPrimary[primary] = (byPrimary[primary] ?? 0) + 1;
    if (!samples[primary]) samples[primary] = [];
    if (samples[primary].length < 5) {
      samples[primary].push({
        slug: row.slug,
        name: row.name,
        city: row.city,
        region: row.region,
        hasPlace: Boolean(row.googlePlaceId),
        hasWebsite: Boolean(row.websiteUrl),
        secondary,
      });
    }
  }

  const outDir = path.join("tmp", "prod-baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `needs-review-blockers-${stamp}.json`);
  const payload = {
    capturedAt: new Date().toISOString(),
    total: rows.length,
    byPrimary,
    safePromotionEligible: byPrimary.SAFE_PROMOTION_ELIGIBLE ?? 0,
    samples,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, total: rows.length, byPrimary }, null, 2));
} finally {
  await prisma.$disconnect();
}
