/**
 * Synthetic 3-venue + same-venue/date collision E2E (production-safe with cleanup).
 * Run: npm run test:host-e2e
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { provisionHostNightLineup, publicLineupPathForNightId } from "../src/lib/host/hostNightProvisioning.ts";
import { assertHostOwnsNight, assertHostOwnsSlot } from "../src/lib/host/hostNightAuth.ts";
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

const QA_EMAIL = "qa-multi-venue-host@micstage.internal";
const QA_SERIES = "Traveling Open Mic QA";
const QA_TAG = "qa-multi-venue-e2e";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function cleanup() {
  const host = await prisma.promoterUser.findUnique({ where: { email: QA_EMAIL }, select: { id: true } });
  if (!host) return;
  await prisma.promoterUser.delete({ where: { id: host.id } });
}

await cleanup();

const venues = await prisma.venue.findMany({ take: 3, select: { id: true, name: true } });
assert.ok(venues.length >= 3, "need at least 3 venues in DB");

const hostSlug = await allocateUniqueHostSlug("MicStage Multi-Venue QA Host", async (s) => {
  const hit = await prisma.promoterUser.findFirst({ where: { hostSlug: s } });
  return Boolean(hit);
});

const host = await prisma.promoterUser.create({
  data: {
    email: QA_EMAIL,
    passwordHash: await bcrypt.hash("qa-not-used", 12),
    displayName: "MicStage Multi-Venue QA Host",
    hostSlug,
  },
});

const series = await prisma.promoterSeries.create({
  data: { promoterId: host.id, name: QA_SERIES, slug: "traveling-open-mic-qa", description: QA_TAG },
});

const date = new Date(Date.UTC(2026, 11, 15));
const nights = [];
for (let i = 0; i < 3; i++) {
  const night = await prisma.promoterNight.create({
    data: {
      seriesId: series.id,
      venueId: venues[i].id,
      date: new Date(date.getTime() + i * 7 * 86400000),
      signupEnabled: true,
      notes: QA_TAG,
    },
  });
  await provisionHostNightLineup(prisma, night.id, { signupEnabled: true });
  nights.push(night);
}

for (const n of nights) {
  const owned = await assertHostOwnsNight(prisma, host.id, n.id);
  assert.equal(owned.ok, true);
  const href = publicLineupPathForNightId(n.id);
  assert.ok(href.startsWith("/nights/"));
}

// Collision: second host, same venue+date as night 0
const host2 = await prisma.promoterUser.create({
  data: {
    email: "qa-collision-host@micstage.internal",
    passwordHash: await bcrypt.hash("qa-not-used", 12),
    displayName: "QA Collision Host",
    hostSlug: `${hostSlug}-collision`,
  },
});
const series2 = await prisma.promoterSeries.create({
  data: { promoterId: host2.id, name: "Comedy Night QA", slug: "comedy-night-qa-collision", description: QA_TAG },
});
const collisionNight = await prisma.promoterNight.create({
  data: {
    seriesId: series2.id,
    venueId: nights[0].venueId,
    date: nights[0].date,
    signupEnabled: true,
    startTimeMin: 1260,
    endTimeMin: 1440,
    notes: QA_TAG,
  },
});
await provisionHostNightLineup(prisma, collisionNight.id, { signupEnabled: true, startTimeMin: 1260, endTimeMin: 1440 });

const tpl1 = await prisma.eventTemplate.findUnique({ where: { promoterNightId: nights[0].id }, include: { instances: { include: { slots: true } } } });
const tpl2 = await prisma.eventTemplate.findUnique({ where: { promoterNightId: collisionNight.id }, include: { instances: { include: { slots: true } } } });
assert.ok(tpl1 && tpl2);
assert.notEqual(tpl1.id, tpl2.id);
assert.notEqual(publicLineupPathForNightId(nights[0].id), publicLineupPathForNightId(collisionNight.id));

const slotA = tpl1.instances[0]?.slots[0]?.id;
const slotB = tpl2.instances[0]?.slots[0]?.id;
assert.ok(slotA && slotB);
assert.notEqual(slotA, slotB);
assert.equal((await assertHostOwnsSlot(prisma, host.id, slotA)).ok, true);
assert.equal((await assertHostOwnsSlot(prisma, host2.id, slotB)).ok, true);
assert.equal((await assertHostOwnsSlot(prisma, host.id, slotB)).ok, false);

// Change venue on night 3
await prisma.promoterNight.update({ where: { id: nights[2].id }, data: { venueId: venues[0].id } });

// Cleanup
await prisma.promoterUser.delete({ where: { id: host2.id } });
await cleanup();

console.log(JSON.stringify({ ok: true, checks: "host-e2e", nights: nights.length, collision: true }));
await pool.end();
