/**
 * Quarantine known geography-conflict listings (deterministic evidence only).
 * Usage: npx tsx scripts/apply-geo-conflict-quarantine.mjs [--apply]
 */
import fs from "node:fs";
import pg from "pg";
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

const apply = process.argv.includes("--apply");
const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Explicit conflicts confirmed from live public copy vs stored geography. */
const ACTIONS = [
  {
    slug: "contemporary-art-center-chicago",
    reason: "GEO_CONFLICT: about describes Peoria cultural hub while city/address say Chicago",
    set: {
      verificationStatus: "OUTDATED",
      city: "Peoria",
      region: "IL",
      country: "US",
      formattedAddress: "Contemporary Art Center, Peoria, IL",
    },
  },
  {
    slug: "aurora-borealis",
    reason: "GEO_CONFLICT: public about references Seattle area while stored address is Chicago Belmont",
    set: {
      verificationStatus: "OUTDATED",
    },
  },
  {
    slug: "open-mic-in-evanston-at-prairie-moon-chicago",
    reason: "GEO_FIX: city already Evanston; clear Chicago from formattedAddress",
    set: {
      city: "Evanston",
      region: "IL",
      country: "US",
      formattedAddress: "Prairie Moon, Evanston, IL",
    },
  },
];

try {
  const results = [];
  for (const action of ACTIONS) {
    const row = await prisma.publicOpenMicListing.findUnique({
      where: { slug: action.slug },
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        region: true,
        country: true,
        formattedAddress: true,
        verificationStatus: true,
        about: true,
        internalNotes: true,
        claimedVenueId: true,
      },
    });
    if (!row) {
      results.push({ slug: action.slug, status: "missing" });
      continue;
    }
    if (row.claimedVenueId) {
      results.push({ slug: action.slug, status: "skipped_claimed" });
      continue;
    }
    const note = `[${new Date().toISOString().slice(0, 10)}] ${action.reason}`;
    if (apply) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          ...action.set,
          internalNotes: [row.internalNotes, note].filter(Boolean).join("\n"),
          ...(action.set.verificationStatus === "OUTDATED"
            ? {
                schedules: undefined,
              }
            : {}),
        },
      });
      if (action.set.verificationStatus === "OUTDATED") {
        await prisma.publicOpenMicSchedule.updateMany({
          where: { listingId: row.id, isActive: true },
          data: { isActive: false },
        });
      }
      await prisma.listingCorrection.create({
        data: {
          listingId: row.id,
          kind: "GEOGRAPHY_QUARANTINE",
          message: action.reason,
          status: "APPLIED",
          reviewedAt: new Date(),
          reviewedByEmail: "support@system",
          reviewNotes: "Deterministic geography conflict quarantine; no replacement invented.",
        },
      });
    }
    results.push({
      slug: action.slug,
      status: apply ? "updated" : "dry_run",
      before: {
        city: row.city,
        region: row.region,
        address: row.formattedAddress,
        verificationStatus: row.verificationStatus,
      },
      set: action.set,
    });
  }
  console.log(JSON.stringify({ apply, results }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
