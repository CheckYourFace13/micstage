/**
 * Backfill displayName + hostSlug for existing PromoterUser rows.
 * Run: npx tsx scripts/backfill-host-identities.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { allocateUniqueHostSlug } from "../src/lib/host/hostSlug.ts";

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

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const users = await prisma.promoterUser.findMany({
  where: { OR: [{ displayName: null }, { hostSlug: null }] },
  include: { application: { select: { brandName: true, contactName: true } } },
});

let updated = 0;
for (const u of users) {
  if (u.displayName && u.hostSlug) continue;
  const displayName =
    u.displayName?.trim() ||
    u.application?.brandName?.trim() ||
    u.application?.contactName?.trim() ||
    u.email.split("@")[0]?.replace(/[.+]/g, " ").trim() ||
    "Host";
  const hostSlug =
    u.hostSlug ||
    (await allocateUniqueHostSlug(displayName, async (s) => {
      const hit = await prisma.promoterUser.findFirst({ where: { hostSlug: s }, select: { id: true } });
      return Boolean(hit);
    }));
  await prisma.promoterUser.update({
    where: { id: u.id },
    data: { displayName: displayName.slice(0, 80), hostSlug },
  });
  updated += 1;
}

console.log(JSON.stringify({ ok: true, updated, scanned: users.length }));
await pool.end();
