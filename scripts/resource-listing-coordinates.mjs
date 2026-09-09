/**
 * Re-source public listing map pins away from Google Places.
 *
 * Places coordinates may not be cached beyond 30 days and may not be displayed next to a
 * non-Google map (ours is OpenStreetMap), so this replaces Google-derived pins with
 * public-domain geocoder output before the retention purge removes them.
 *
 * Usage: npx tsx scripts/resource-listing-coordinates.mjs [--limit N] [--all]
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const { geocodeAddressWithoutGoogle } = await import("../src/lib/geo/nonGoogleGeocode.ts");

const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg
  ? Number.parseInt(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1], 10)
  : 150;
const ALL = process.argv.includes("--all");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RETRY_UNRESOLVED = process.argv.includes("--retry-unresolved");
const where = {
  removedAt: null,
  OR: [
    { coordSource: null },
    { coordSource: "google" },
    ...(RETRY_UNRESOLVED ? [{ coordSource: "unresolved" }] : []),
  ],
  // Published/holding listings are the ones plotted on the public map; heal those first.
  ...(ALL ? {} : { verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW"] } }),
};

const rows = await prisma.publicOpenMicListing.findMany({
  where,
  select: { id: true, slug: true, formattedAddress: true, city: true, region: true, lat: true },
  orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
  take: LIMIT,
});

const stats = { scanned: 0, resourced: 0, unresolved: 0, bySource: {} };
for (const row of rows) {
  stats.scanned++;
  const hit = await geocodeAddressWithoutGoogle(row);
  if (!hit) {
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: { coordSource: "unresolved", coordsUpdatedAt: new Date() },
    });
    stats.unresolved++;
    continue;
  }
  await prisma.publicOpenMicListing.update({
    where: { id: row.id },
    data: { lat: hit.lat, lng: hit.lng, coordSource: hit.source, coordsUpdatedAt: new Date() },
  });
  stats.resourced++;
  stats.bySource[hit.source] = (stats.bySource[hit.source] ?? 0) + 1;
  await new Promise((r) => setTimeout(r, 120));
}

const remaining = await prisma.publicOpenMicListing.count({ where });
console.log(JSON.stringify({ mode: ALL ? "ALL" : "DISPLAYED_ONLY", limit: LIMIT, stats, remaining }, null, 2));
await prisma.$disconnect();
