/**
 * Fixture QA for Host/Venue night delete/cancel.
 *   npm run test:night-delete-cancel
 *
 * Uses QA-tagged fixtures only. Does not touch Eligio/Marvin/customer data.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, BookingRestrictionMode, Weekday } from "../src/generated/prisma/index.js";
import { cancelOrDeleteHostNight } from "../src/lib/host/cancelOrDeleteHostNight.ts";
import { cancelOrDeleteVenueOwnedDay } from "../src/lib/venue/cancelOrDeleteVenueOwnedDay.ts";
import { softCancelSlotBooking } from "../src/lib/bookingSlotAssign.ts";
import { assertHostOwnsNight } from "../src/lib/host/hostNightAuth.ts";
import { provisionHostNightLineup } from "../src/lib/host/hostNightProvisioning.ts";
import { loadHostNightLineupContext } from "../src/lib/host/hostNightLineupData.ts";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const TAG = "QA_NIGHT_DELETE_CANCEL";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

function ymdUtc(daysFromNow) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d;
}

async function cleanup() {
  const nights = await prisma.promoterNight.findMany({
    where: { title: { startsWith: TAG } },
    select: { id: true },
  });
  for (const n of nights) {
    await prisma.promoterNight.delete({ where: { id: n.id } }).catch(() => {});
  }
  await prisma.promoterSeries.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.eventTemplate.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.venue.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.promoterUser.deleteMany({ where: { email: { startsWith: "qa-night-del-" } } });
  await prisma.venueOwner.deleteMany({ where: { email: { startsWith: "qa-night-del-" } } });
  await prisma.musicianUser.deleteMany({ where: { email: { startsWith: "qa-night-del-" } } });
}

async function main() {
  await cleanup();

  const stamp = Date.now();
  const hostA = await prisma.promoterUser.create({
    data: {
      email: `qa-night-del-host-a-${stamp}@example.com`,
      passwordHash: "x",
      displayName: `${TAG} Host A`,
    },
  });
  const hostB = await prisma.promoterUser.create({
    data: {
      email: `qa-night-del-host-b-${stamp}@example.com`,
      passwordHash: "x",
      displayName: `${TAG} Host B`,
    },
  });
  const venueOwner = await prisma.venueOwner.create({
    data: {
      email: `qa-night-del-venue-${stamp}@example.com`,
      passwordHash: "x",
    },
  });
  const venue = await prisma.venue.create({
    data: {
      ownerId: venueOwner.id,
      name: `${TAG} Venue`,
      slug: `qa-night-del-venue-${stamp}`,
      timeZone: "America/Chicago",
      googlePlaceId: `qa-night-del-place-${stamp}`,
      formattedAddress: "123 QA Night Delete St, Test City, TX",
      city: "Test City",
      region: "TX",
      country: "US",
      lat: 30.0,
      lng: -97.0,
    },
  });
  const seriesA = await prisma.promoterSeries.create({
    data: { promoterId: hostA.id, name: `${TAG} Series A`, slug: `qa-night-del-a-${stamp}` },
  });
  const seriesB = await prisma.promoterSeries.create({
    data: { promoterId: hostB.id, name: `${TAG} Series B`, slug: `qa-night-del-b-${stamp}` },
  });

  // A. Empty night → delete
  const emptyNight = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(14),
      title: `${TAG} empty`,
      signupEnabled: true,
    },
  });
  await provisionHostNightLineup(prisma, emptyNight.id);
  const delEmpty = await cancelOrDeleteHostNight(prisma, emptyNight.id);
  assert.equal(delEmpty.ok, true);
  assert.equal(delEmpty.mode, "deleted");
  assert.equal(await prisma.promoterNight.findUnique({ where: { id: emptyNight.id } }), null);
  assert.equal(await loadHostNightLineupContext(emptyNight.id), null);
  console.log("A PASS empty delete");

  // B. Recurring isolation — delete one of two
  const n1 = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(21),
      title: `${TAG} fri1`,
      signupEnabled: true,
    },
  });
  const n2 = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(28),
      title: `${TAG} fri2`,
      signupEnabled: true,
    },
  });
  await provisionHostNightLineup(prisma, n1.id);
  await provisionHostNightLineup(prisma, n2.id);
  const delOne = await cancelOrDeleteHostNight(prisma, n1.id);
  assert.equal(delOne.ok && delOne.mode, "deleted");
  assert.ok(await prisma.promoterNight.findUnique({ where: { id: n2.id } }));
  assert.ok(await prisma.promoterSeries.findUnique({ where: { id: seriesA.id } }));
  console.log("B PASS recurring isolation");

  // C. Active booking → cancel + history
  const bookedNight = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(35),
      title: `${TAG} booked`,
      signupEnabled: true,
    },
  });
  const { instanceId } = await provisionHostNightLineup(prisma, bookedNight.id);
  const slot = await prisma.slot.findFirst({
    where: { instanceId },
    orderBy: { startMin: "asc" },
  });
  assert.ok(slot);
  const booking = await prisma.booking.create({
    data: {
      slotId: slot.id,
      performerName: "QA Performer",
      performerEmail: `qa-night-del-perf-${stamp}@example.com`,
    },
  });
  await prisma.slot.update({ where: { id: slot.id }, data: { status: "RESERVED" } });
  const cancelBooked = await cancelOrDeleteHostNight(prisma, bookedNight.id);
  assert.equal(cancelBooked.ok, true);
  assert.equal(cancelBooked.mode, "cancelled");
  const nightAfter = await prisma.promoterNight.findUnique({ where: { id: bookedNight.id } });
  assert.ok(nightAfter?.cancelledAt);
  assert.equal(nightAfter?.signupEnabled, false);
  const bookingAfter = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.ok(bookingAfter?.cancelledAt);
  const hist = await prisma.bookingHistory.count({ where: { bookingId: booking.id, reason: "CANCELLED" } });
  assert.ok(hist >= 1);
  assert.equal(await loadHostNightLineupContext(bookedNight.id), null);
  const inst = await prisma.eventInstance.findFirst({
    where: { template: { promoterNightId: bookedNight.id } },
  });
  assert.equal(inst?.isCancelled, true);
  console.log("C PASS booked cancel + history");

  // D. Cancelled history only → cancel/archive (preserve), not hard-delete cascade
  const histNight = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(42),
      title: `${TAG} hist-only`,
      signupEnabled: true,
    },
  });
  const { instanceId: histInstId } = await provisionHostNightLineup(prisma, histNight.id);
  const histSlot = await prisma.slot.findFirst({ where: { instanceId: histInstId }, orderBy: { startMin: "asc" } });
  assert.ok(histSlot);
  const histBooking = await prisma.booking.create({
    data: {
      slotId: histSlot.id,
      performerName: "QA Hist",
      performerEmail: null,
    },
  });
  await prisma.$transaction(async (tx) => {
    await softCancelSlotBooking(tx, histSlot.id, "CANCELLED");
  });
  const histBefore = await prisma.bookingHistory.count({ where: { slotId: histSlot.id } });
  assert.ok(histBefore >= 1);
  const cancelHist = await cancelOrDeleteHostNight(prisma, histNight.id);
  assert.equal(cancelHist.ok && cancelHist.mode, "cancelled");
  const histAfter = await prisma.bookingHistory.count({ where: { slotId: histSlot.id } });
  assert.equal(histAfter, histBefore);
  assert.ok(await prisma.booking.findUnique({ where: { id: histBooking.id } }));
  console.log("D PASS history preserved");

  // E. Unauthorized host
  const owned = await assertHostOwnsNight(prisma, hostB.id, n2.id);
  assert.equal(owned.ok, false);
  const foreign = await assertHostOwnsNight(prisma, hostA.id, n2.id);
  assert.equal(foreign.ok, true);
  console.log("E PASS auth host isolation");

  // F/G. Venue-owned empty + booked day
  const venueTpl = await prisma.eventTemplate.create({
    data: {
      venueId: venue.id,
      title: `${TAG} venue tpl`,
      weekday: Weekday.FRI,
      startTimeMin: 1200,
      endTimeMin: 1380,
      slotMinutes: 15,
      breakMinutes: 5,
      bookingRestrictionMode: BookingRestrictionMode.NONE,
      isPublic: true,
      timeZone: "America/Chicago",
    },
  });
  const emptyDay = ymdUtc(50);
  const emptyInst = await prisma.eventInstance.create({
    data: { templateId: venueTpl.id, date: emptyDay, isCancelled: false },
  });
  await prisma.slot.create({
    data: {
      instanceId: emptyInst.id,
      startMin: 1200,
      endMin: 1215,
      status: "AVAILABLE",
    },
  });
  const vDel = await cancelOrDeleteVenueOwnedDay(prisma, venue.id, emptyDay);
  assert.equal(vDel.ok && vDel.mode, "deleted");
  assert.equal(await prisma.eventInstance.findUnique({ where: { id: emptyInst.id } }), null);
  console.log("F PASS venue empty delete");

  const bookedDay = ymdUtc(57);
  const bookedInst = await prisma.eventInstance.create({
    data: { templateId: venueTpl.id, date: bookedDay, isCancelled: false },
  });
  const vSlot = await prisma.slot.create({
    data: {
      instanceId: bookedInst.id,
      startMin: 1200,
      endMin: 1215,
      status: "RESERVED",
    },
  });
  const vBooking = await prisma.booking.create({
    data: {
      slotId: vSlot.id,
      performerName: "Venue QA",
      performerEmail: `qa-night-del-vperf-${stamp}@example.com`,
    },
  });
  const vCancel = await cancelOrDeleteVenueOwnedDay(prisma, venue.id, bookedDay);
  assert.equal(vCancel.ok && vCancel.mode, "cancelled");
  const vInstAfter = await prisma.eventInstance.findUnique({ where: { id: bookedInst.id } });
  assert.equal(vInstAfter?.isCancelled, true);
  assert.ok((await prisma.booking.findUnique({ where: { id: vBooking.id } }))?.cancelledAt);
  assert.ok((await prisma.bookingHistory.count({ where: { bookingId: vBooking.id } })) >= 1);
  console.log("G PASS venue booked cancel");

  // Host night at same venue/date must not be touched by venue day cancel
  const hostAtVenue = await prisma.promoterNight.create({
    data: {
      seriesId: seriesA.id,
      venueId: venue.id,
      date: ymdUtc(64),
      title: `${TAG} host-at-venue`,
      signupEnabled: true,
    },
  });
  await provisionHostNightLineup(prisma, hostAtVenue.id);
  const hostDay = ymdUtc(64);
  // venue-owned instance same day (separate)
  const otherInst = await prisma.eventInstance.create({
    data: { templateId: venueTpl.id, date: hostDay, isCancelled: false },
  });
  await cancelOrDeleteVenueOwnedDay(prisma, venue.id, hostDay);
  assert.ok(await prisma.promoterNight.findUnique({ where: { id: hostAtVenue.id } }));
  assert.equal(
    (await prisma.eventInstance.findUnique({ where: { id: otherInst.id } }))?.isCancelled ?? true,
    true,
  );
  // host night still active (not cancelled)
  const hostStill = await prisma.promoterNight.findUnique({ where: { id: hostAtVenue.id } });
  assert.equal(hostStill?.cancelledAt, null);
  console.log("G2 PASS venue cancel does not touch host night");

  // J. Public signup after removal
  assert.equal(await loadHostNightLineupContext(bookedNight.id), null);
  console.log("J PASS public context null after cancel");

  // Eligio/Marvin untouched check — no writes to known production promoters in this script
  console.log("Eligio/Marvin: fixtures only — untouched");

  await cleanup();
  console.log("ALL PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  });
