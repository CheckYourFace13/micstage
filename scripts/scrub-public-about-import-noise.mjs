/**
 * Move crawler/import noise out of PublicOpenMicListing.about into internalNotes.
 * Does not invent replacement copy. Usage: npx tsx scripts/scrub-public-about-import-noise.mjs [--apply]
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { sanitizePublicListingAbout } from "../src/lib/publicListings/listingAboutFromLead.ts";

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
const LEAK =
  /claude_csv|batch\s*=|identified from public listings|\[micstage_email_meta\]|discovery notes?|internal note|quality gate|verification gate|file\s*=/i;

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: { about: { not: null }, removedAt: null },
    select: { id: true, slug: true, about: true, internalNotes: true },
    take: 8000,
  });
  let scanned = 0;
  let cleared = 0;
  let cleaned = 0;
  const samples = [];
  for (const row of rows) {
    if (!row.about || !LEAK.test(row.about)) continue;
    scanned += 1;
    const publicSafe = sanitizePublicListingAbout(row.about);
    const stamp = `[${new Date().toISOString().slice(0, 10)}] moved crawler/import about noise to internalNotes`;
    const nextAbout = publicSafe;
    const nextNotes = [row.internalNotes, stamp, `prior_about: ${row.about.slice(0, 500)}`]
      .filter(Boolean)
      .join("\n");
    if (apply) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { about: nextAbout, internalNotes: nextNotes },
      });
    }
    if (!nextAbout) cleared += 1;
    else cleaned += 1;
    if (samples.length < 12) {
      samples.push({ slug: row.slug, before: row.about.slice(0, 100), after: nextAbout?.slice(0, 100) ?? null });
    }
  }
  console.log(JSON.stringify({ apply, matched: scanned, cleared, cleaned, samples }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
