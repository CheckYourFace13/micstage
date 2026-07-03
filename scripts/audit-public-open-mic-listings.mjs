/**
 * Quarantine existing public open mic listings whose NAME looks like an
 * article, listicle, generic page title, or scraped URL/path fragment.
 *
 * Non-destructive: matching rows are moved to verificationStatus=OUTDATED
 * (hidden from all public surfaces) with a rejection reason appended to
 * internalNotes. Rows are kept for audit in the admin console. Claimed
 * listings are never touched.
 *
 * Usage:
 *   node scripts/audit-public-open-mic-listings.mjs            # dry run (default)
 *   node scripts/audit-public-open-mic-listings.mjs --apply    # write changes
 *   node scripts/audit-public-open-mic-listings.mjs --apply --limit=500
 *
 * Name-quality rules come from the shared JS classifier
 * (scripts/lib/listingNameClassifier.mjs), which mirrors
 * src/lib/publicListings/listingQuality.ts.
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { classifyListingName } from "./lib/listingNameClassifier.mjs";

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

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 0) : undefined;

/** Exact names called out in the audit brief that must be quarantined on sight. */
const EXPLICIT_DENYLIST = new Set(
  [
    "spectrum center charlotte",
    "10 best live music venues in charlotte, nc",
    "12 best comedy clubs in dallas for a night of laughs",
    "14 open mics to try standup comedy in dc",
    "24 things to do in the rockford area this weekend",
  ].map((s) => s.toLowerCase()),
);

function classifyName(name) {
  const n = (name ?? "").trim();
  if (EXPLICIT_DENYLIST.has(n.toLowerCase())) return "GENERIC_PAGE_TITLE";
  return classifyListingName(n);
}

function appendNote(existing, reason) {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] quarantined: ${reason}`;
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED"] },
    },
    orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
    ...(limit ? { take: limit } : {}),
    select: { id: true, slug: true, name: true, verificationStatus: true, internalNotes: true },
  });

  const byReason = {};
  let quarantined = 0;

  for (const row of rows) {
    const reason = classifyName(row.name);
    if (!reason) continue;
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    quarantined += 1;

    const label = `${reason} (${row.verificationStatus})`;
    if (!apply) {
      console.log(`[dry-run] OUTDATED  ${row.slug.padEnd(40)} ${label}  ${row.name}`);
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "OUTDATED",
        internalNotes: appendNote(row.internalNotes, reason),
      },
    });
    console.log(`OUTDATED  ${row.slug.padEnd(40)} ${label}`);
  }

  console.log(
    JSON.stringify(
      { ok: true, apply, scanned: rows.length, quarantined, byReason, limit: limit ?? null },
      null,
      2,
    ),
  );
  if (!apply && quarantined > 0) {
    console.log("\nDry run only. Re-run with --apply to move these to OUTDATED.");
  }
} finally {
  await prisma.$disconnect();
}
