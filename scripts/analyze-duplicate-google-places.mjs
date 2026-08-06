/**
 * Architecture recommendation + analysis for DUPLICATE_GOOGLE_PLACE listings.
 * Read-only. Does not merge or delete.
 *
 * Recommendation (do not remove uniqueness casually):
 * Prefer "one PublicOpenMicListing per recurring series" with a shared place identity
 * that is NOT unique — OR keep uniqueness and model multiple series as schedules
 * under one listing. Current schema unique googlePlaceId incorrectly blocks multiple
 * legitimate series at one venue; migrate carefully later after product decision.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

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

function normalizeName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classifyPair(a, b) {
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  const sameName = na === nb || na.includes(nb) || nb.includes(na);
  const notesDup = /duplicate google place/i.test(a.internalNotes || "") || /duplicate google place/i.test(b.internalNotes || "");

  if (a.claimedVenueId || b.claimedVenueId) return "AMBIGUOUS_CLAIMED_PROTECTION";
  if (sameName && a.verificationStatus === b.verificationStatus) return "EXACT_OR_NAMING_VARIATION";
  if (!sameName && a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) return "MULTIPLE_SERIES_SAME_VENUE_OR_WRONG_MATCH";
  if (notesDup && !a.googlePlaceId) return "BLOCKED_BY_UNIQUE_PLACE_CONSTRAINT";
  return "AMBIGUOUS";
}

const ARCHITECTURE = {
  summary:
    "Do not drop PublicOpenMicListing.googlePlaceId @unique in this milestone. Recommend phased design: (1) keep unique for now and auto-merge exact duplicates; (2) add sharedPlaceKey / venuePlaceIdentity later OR allow multiple listings per place with seriesKey; (3) claim/Venue.googlePlaceId remains unique for registered venues.",
  options: [
    {
      id: "A_one_listing_many_schedules",
      description: "One listing per place; multiple PublicOpenMicSchedule / EventTemplate series",
      pros: ["Fits claim → one Venue", "No unique conflict"],
      cons: ["Harder SEO for distinct series names"],
    },
    {
      id: "B_many_listings_shared_place",
      description: "Multiple listings share placeId (drop unique) with series differentiation",
      pros: ["Natural for Mon comedy + Wed poetry"],
      cons: ["Claim must choose which series; Venue place still unique"],
    },
    {
      id: "C_place_hub_record",
      description: "New PlaceIdentity hub; listings FK without unique place on listing",
      pros: ["Cleanest long-term"],
      cons: ["Larger migration"],
    },
  ],
  recommendedNext: "A for exact duplicates now; design B/C before removing uniqueness",
};

try {
  const blocked = await prisma.publicOpenMicListing.findMany({
    where: {
      OR: [
        { internalNotes: { contains: "Duplicate Google place", mode: "insensitive" } },
        { internalNotes: { contains: "duplicate google place", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      googlePlaceId: true,
      verificationStatus: true,
      claimStatus: true,
      claimedVenueId: true,
      sourceUrl: true,
      websiteUrl: true,
      internalNotes: true,
      createdAt: true,
      schedules: { select: { weekday: true, startTimeMin: true, title: true } },
      growthLead: { select: { contactEmailNormalized: true, contactEmailConfidence: true } },
    },
    take: 200,
  });

  // Also find actual place id collisions (should be rare due to unique)
  const withPlace = await prisma.publicOpenMicListing.findMany({
    where: { googlePlaceId: { not: null } },
    select: { id: true, googlePlaceId: true, name: true, slug: true },
  });
  const byPlace = new Map();
  for (const r of withPlace) {
    if (!r.googlePlaceId) continue;
    const arr = byPlace.get(r.googlePlaceId) || [];
    arr.push(r);
    byPlace.set(r.googlePlaceId, arr);
  }
  const actualCollisions = [...byPlace.entries()].filter(([, v]) => v.length > 1);

  const classes = {};
  for (const row of blocked) {
    const winnerSlug = (row.internalNotes || "").match(/already on ([a-z0-9-]+)/i)?.[1];
    const winner = winnerSlug
      ? await prisma.publicOpenMicListing.findUnique({
          where: { slug: winnerSlug },
          select: {
            id: true,
            slug: true,
            name: true,
            googlePlaceId: true,
            verificationStatus: true,
            claimStatus: true,
            claimedVenueId: true,
            internalNotes: true,
          },
        })
      : null;
    const klass = winner ? classifyPair(row, winner) : "BLOCKED_BY_UNIQUE_PLACE_CONSTRAINT";
    classes[klass] = (classes[klass] || 0) + 1;
  }

  const report = {
    ok: true,
    capturedAt: new Date().toISOString(),
    architecture: ARCHITECTURE,
    duplicateNoteCount: blocked.length,
    actualPlaceIdCollisions: actualCollisions.length,
    classificationCounts: classes,
    sampleBlocked: blocked.slice(0, 15).map((r) => ({
      slug: r.slug,
      name: r.name,
      city: r.city,
      region: r.region,
      verificationStatus: r.verificationStatus,
      schedules: r.schedules,
      notePreview: (r.internalNotes || "").slice(0, 120),
    })),
    safeAutoMergeEligibleHint:
      "EXACT_OR_NAMING_VARIATION groups where neither is claimed and one is VERIFIED — merge later via dedicated script with audit",
  };

  const outDir = path.join("tmp", "prod-baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `duplicate-place-analysis-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, ...report, sampleBlocked: report.sampleBlocked.length }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
