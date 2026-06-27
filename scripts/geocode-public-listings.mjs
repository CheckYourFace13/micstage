/**
 * Forward-geocode public listings missing lat/lng (Nominatim, 1 req/sec).
 * Usage: node scripts/geocode-public-listings.mjs [--limit=50] [--dry-run]
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

const url =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocodeQuery(q) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=1`;
  const res = await fetch(nominatimUrl, {
    headers: {
      "User-Agent": "MicStage/1.0 (https://micstage.com; listing geocode)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data[0];
  if (!hit) return null;
  const lat = Number.parseFloat(hit.lat);
  const lng = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { not: "OUTDATED" },
      OR: [{ lat: null }, { lng: null }],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, city: true, region: true, formattedAddress: true },
  });

  let updated = 0;
  for (const row of rows) {
    const q = [row.name, row.city, row.region].filter(Boolean).join(", ") || row.formattedAddress;
    const geo = await geocodeQuery(q);
    await sleep(1100);
    if (!geo) {
      console.log("miss", row.slug);
      continue;
    }
    if (dryRun) {
      console.log("[dry-run]", row.slug, geo);
      updated += 1;
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: { lat: geo.lat, lng: geo.lng },
    });
    console.log("geocoded", row.slug);
    updated += 1;
  }

  console.log(JSON.stringify({ ok: true, updated, candidates: rows.length, dryRun }, null, 2));
} finally {
  await prisma.$disconnect();
}
