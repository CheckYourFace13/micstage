/**
 * Idempotent backfill: provision EventTemplate + EventInstance for historical PromoterNights.
 * Run: npm run backfill:host-night-lineups
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { provisionHostNightLineup } from "../src/lib/host/hostNightProvisioning.ts";

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
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const before = {
  total: await prisma.promoterNight.count(),
  provisioned: await prisma.eventTemplate.count({ where: { promoterNightId: { not: null } } }),
  missing: await prisma.promoterNight.count({
    where: { eventTemplate: null },
  }),
};

const nights = await prisma.promoterNight.findMany({
  where: { eventTemplate: null },
  select: { id: true, signupEnabled: true },
  orderBy: { createdAt: "asc" },
});

let backfilled = 0;
let failures = 0;
for (const n of nights) {
  try {
    await provisionHostNightLineup(prisma, n.id, { signupEnabled: n.signupEnabled });
    backfilled += 1;
  } catch (e) {
    failures += 1;
    console.error("[backfill-host-night-lineups]", n.id, e instanceof Error ? e.message : e);
  }
}

const after = {
  total: await prisma.promoterNight.count(),
  provisioned: await prisma.eventTemplate.count({ where: { promoterNightId: { not: null } } }),
  missing: await prisma.promoterNight.count({ where: { eventTemplate: null } }),
};

console.log(
  JSON.stringify({
    ok: failures === 0,
    before,
    backfilled,
    failures,
    after,
  }),
);

await pool.end();
process.exit(failures > 0 ? 1 : 0);
