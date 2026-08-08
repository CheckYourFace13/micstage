/**
 * One-shot backlog drain against production DB (publish / reject / verify / promote / mine).
 * Usage: npx tsx scripts/run-listing-backlog-once.mjs
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import pg from "pg";
import { runListingBacklogProcessor } from "../src/lib/publicListings/listingBacklogProcessor.ts";

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

// Prefer aggressive one-shot budgets for this operator-triggered drain.
process.env.LISTING_BACKLOG_PUBLISH_PER_TICK ||= "60";
process.env.LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK ||= "40";
process.env.LISTING_BACKLOG_PROMOTE_PER_TICK ||= "80";
process.env.LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK ||= "40";
process.env.LISTING_AUTO_REJECT_JUNK_PER_RUN ||= "150";
process.env.LISTING_VERIFIED_CONTACT_MINE_PER_TICK ||= "25";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const result = await runListingBacklogProcessor(prisma);
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();
await pool.end();
