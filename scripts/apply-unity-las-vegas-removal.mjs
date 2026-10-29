/**
 * Soft-remove Unity of Las Vegas Coffee House Open Mic Night after first-party deletion request.
 * Preserves audit/source history. Does not publish a private-home replacement.
 *
 * Dry-run by default. Apply with: npx tsx scripts/apply-unity-las-vegas-removal.mjs --apply
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { applyAuthoritativeListingRemoval } from "../src/lib/publicListings/authoritativeListingRemoval.ts";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!key) continue;
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

const NOTE =
  "AUTHORITATIVE_FIRST_PARTY_REMOVAL: Unity of Las Vegas requested deletion. Prior open mic not held since spring. Private-home replacement not published.";

try {
  const listings = await prisma.publicOpenMicListing.findMany({
    where: {
      OR: [
        { name: { contains: "Unity of Las Vegas", mode: "insensitive" } },
        { name: { contains: "Coffee House Open Mic", mode: "insensitive" } },
        { slug: { contains: "unity-of-las-vegas", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      verificationStatus: true,
      removedAt: true,
      claimInviteEmail: true,
      growthLeadId: true,
      formattedAddress: true,
      sourceUrl: true,
      internalNotes: true,
      schedules: {
        select: { id: true, weekday: true, startTimeMin: true, isActive: true, title: true },
      },
    },
  });

  const target = listings.filter((l) => {
    const blob = `${l.name} ${l.slug} ${l.city ?? ""} ${l.formattedAddress ?? ""}`.toLowerCase();
    return blob.includes("unity") && (blob.includes("las vegas") || blob.includes("vegas"));
  });

  const summary = {
    dryRun: !apply,
    matched: target.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      city: l.city,
      region: l.region,
      verificationStatus: l.verificationStatus,
      removedAt: l.removedAt,
      activeSchedules: l.schedules.filter((s) => s.isActive).length,
      totalSchedules: l.schedules.length,
      hasClaimInviteEmail: Boolean(l.claimInviteEmail),
      growthLeadId: l.growthLeadId,
    })),
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const results = [];
    for (const listing of target) {
      const out = await applyAuthoritativeListingRemoval({
        prisma,
        listingId: listing.id,
        actorLabel: "support-unity-official-reply",
        note: NOTE,
      });
      results.push(out);
    }
    console.log(JSON.stringify({ ...summary, dryRun: false, results }, null, 2));
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
