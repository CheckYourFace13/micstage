/**
 * Create OPEN MIC 2.0 at The Fox and Hounds (Studio City) for Eligio Find path.
 *
 * Evidence (official venue calendar, 2026-08 fetch):
 *   "Starting Oct. 9th. Open Mic Every Friday, 9:00pm"
 *   https://www.thefoxandhounds.net/events/
 *
 * Does NOT grant PromoterVenueAccess — Eligio must connect via Find.
 * Does NOT email Eligio.
 *
 * Usage: node scripts/create-open-mic-20-fox-hounds.mjs
 */
import fs from "node:fs";
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

const SOURCE = "https://www.thefoxandhounds.net/events/";
const WEBSITE = "https://www.thefoxandhounds.net/";
const SLUG = "open-mic-2-0-fox-and-hounds-studio-city";

const existing = await prisma.publicOpenMicListing.findFirst({
  where: {
    OR: [
      { slug: SLUG },
      { name: { contains: "OPEN MIC 2.0", mode: "insensitive" } },
      {
        AND: [
          { name: { contains: "Fox", mode: "insensitive" } },
          { name: { contains: "Hound", mode: "insensitive" } },
          { city: { contains: "Studio", mode: "insensitive" } },
        ],
      },
    ],
  },
  select: { id: true, slug: true, name: true, verificationStatus: true },
});

if (existing) {
  console.log("Already exists:", existing);
  await prisma.$disconnect();
  process.exit(0);
}

const now = new Date();
const listing = await prisma.publicOpenMicListing.create({
  data: {
    name: "OPEN MIC 2.0 at The Fox and Hounds",
    slug: SLUG,
    formattedAddress: "The Fox and Hounds, Studio City, Los Angeles, CA",
    city: "Studio City",
    region: "CA",
    country: "US",
    websiteUrl: WEBSITE,
    sourceUrl: SOURCE,
    sourceName: "The Fox and Hounds official events calendar",
    verificationStatus: "VERIFIED",
    lastVerifiedAt: now,
    about:
      "Weekly open mic every Friday at 9:00 PM at The Fox and Hounds in Studio City (starting Oct 9). Promoter series: OPEN MIC 2.0.",
    internalNotes: [
      `[${now.toISOString().slice(0, 10)}] created_for_promoter_match OPEN MIC 2.0 / Eligio Yates application`,
      `Official evidence: "${SOURCE}" — "Starting Oct. 9th. Open Mic Every Friday, 9:00pm"`,
      `EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED (official_website recurring Friday)`,
      `Do not auto-grant PromoterVenueAccess — connect via Find / request access.`,
    ].join("\n"),
    schedules: {
      create: {
        weekday: "FRI",
        startTimeMin: 21 * 60,
        endTimeMin: 23 * 60,
        timeZone: "America/Los_Angeles",
        title: "OPEN MIC 2.0",
        description: "Open mic every Friday starting at 9:00pm (per venue calendar, starting Oct 9).",
        isActive: true,
        sourceUrl: SOURCE,
        lastVerifiedAt: now,
      },
    },
  },
  select: { id: true, slug: true, name: true },
});

console.log("Created:", listing);
console.log("Public URL: https://micstage.com/open-mics/" + listing.slug);

await prisma.$disconnect();
