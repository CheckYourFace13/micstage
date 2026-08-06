/**
 * Demote public listings whose names indicate cancelled/closed/ended events to OUTDATED.
 * Dry-run by default. Preserves audit notes. Never touches claimed listings.
 *
 * Usage:
 *   node scripts/demote-cancelled-public-listings.mjs
 *   node scripts/demote-cancelled-public-listings.mjs --apply
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
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function appendNote(existing, reason) {
  const line = `[${new Date().toISOString().slice(0, 10)}] demote: ${reason}`;
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

try {
  const before = await prisma.publicOpenMicListing.groupBy({
    by: ["verificationStatus"],
    _count: true,
  });

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW"] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      verificationStatus: true,
      internalNotes: true,
    },
  });

  const hits = [];
  for (const row of rows) {
    const reason = classifyListingName(row.name);
    if (reason === "CANCELLED_OR_CLOSED") {
      hits.push({ ...row, rejectReason: reason });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        scanned: rows.length,
        demoteCandidates: hits.length,
        before,
        samples: hits.slice(0, 25).map((h) => ({
          slug: h.slug,
          name: h.name,
          from: h.verificationStatus,
          reason: h.rejectReason,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to demote.");
    process.exit(0);
  }

  let demoted = 0;
  for (const row of hits) {
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "OUTDATED",
        lastVerifiedAt: new Date(),
        internalNotes: appendNote(
          row.internalNotes,
          `CANCELLED_OR_CLOSED name classifier (${row.rejectReason}): "${row.name}"`,
        ),
      },
    });
    demoted += 1;
  }

  const after = await prisma.publicOpenMicListing.groupBy({
    by: ["verificationStatus"],
    _count: true,
  });

  console.log(JSON.stringify({ ok: true, demoted, after }, null, 2));
} finally {
  await prisma.$disconnect();
}
