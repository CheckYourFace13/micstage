/**
 * Mark low-quality public listings as OUTDATED (karaoke, blogs, generic pages).
 * Usage: node scripts/curate-public-listings.mjs [--dry-run]
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

const dryRun = process.argv.includes("--dry-run");

const JUNK =
  /\b(karaoke|trivia|best bars|nightlife guide|review:|must-chicago|bandmix|pub trivia|private events|how to mic|blog|list of all|top ten live|live music trail|comedy clubs shows in)\b/i;

const GENERIC_ARTIFACT =
  /^(write|events|stand|home|local events|event venue|open mic night|open mic|home-\d+)$/i;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: { verificationStatus: { not: "OUTDATED" }, claimedVenueId: null },
    select: { id: true, slug: true, name: true },
  });

  let marked = 0;
  for (const row of rows) {
    const n = row.name.trim();
    const junk = JUNK.test(n) || GENERIC_ARTIFACT.test(n) || /^home(-\d+)?$/i.test(n) || n.length < 4;
    if (!junk) continue;
    if (dryRun) {
      console.log("[dry-run] OUTDATED", row.slug, n);
      marked += 1;
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: { verificationStatus: "OUTDATED" },
    });
    console.log("OUTDATED", row.slug);
    marked += 1;
  }

  console.log(JSON.stringify({ ok: true, marked, dryRun, scanned: rows.length }, null, 2));
} finally {
  await prisma.$disconnect();
}
