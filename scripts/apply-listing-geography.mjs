/**
 * Correct unclaimed listing city/region from title/address cues.
 * Does not invent replacement events. Does not touch claimed customer venues.
 *
 * Dry-run by default. Apply: npx tsx scripts/apply-listing-geography.mjs --apply
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { suggestedListingCityRegion } from "../src/lib/publicListings/evidenceTrust.ts";

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

const apply = process.argv.includes("--apply");
const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const listings = await prisma.publicOpenMicListing.findMany({
    where: { claimedVenueId: null, removedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      verificationStatus: true,
      evidenceTerminalReason: true,
      internalNotes: true,
    },
  });

  const changes = [];
  for (const l of listings) {
    const suggested = suggestedListingCityRegion({
      name: l.name,
      city: l.city,
      region: l.region,
      formattedAddress: l.formattedAddress,
    });
    if (!suggested) continue;
    if (
      suggested.city.toLowerCase() === (l.city || "").trim().toLowerCase() &&
      suggested.region.toUpperCase() === (l.region || "").trim().toUpperCase()
    ) {
      continue;
    }
    const publicVerified = l.verificationStatus === "VERIFIED";
    const metroConflict = suggested.reason === "title_metro_conflict";
    if (!publicVerified && !metroConflict) continue;
    changes.push({
      id: l.id,
      slug: l.slug,
      name: l.name,
      from: { city: l.city, region: l.region },
      to: { city: suggested.city, region: suggested.region },
      reason: suggested.reason,
      verificationStatus: l.verificationStatus,
    });
  }

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, wouldChange: changes.length, sample: changes.slice(0, 40) }, null, 2));
  } else {
    const noteDate = new Date().toISOString().slice(0, 10);
    for (const c of changes) {
      const row = listings.find((l) => l.id === c.id);
      const stamp = `[${noteDate}] GEOGRAPHY_CORRECTED ${c.reason}: ${c.from.city || "?"} ${c.from.region || "?"} → ${c.to.city} ${c.to.region}`;
      await prisma.publicOpenMicListing.update({
        where: { id: c.id },
        data: {
          city: c.to.city,
          region: c.to.region,
          internalNotes: [row?.internalNotes, stamp].filter(Boolean).join("\n"),
        },
      });
    }
    console.log(JSON.stringify({ dryRun: false, changed: changes.length, sample: changes.slice(0, 40) }, null, 2));
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
