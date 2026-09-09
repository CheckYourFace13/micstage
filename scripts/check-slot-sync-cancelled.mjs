/**
 * Regression: schedule shrink must drop orphan early slots whose only booking is cancelled.
 * Also covers Host 9 PM → 1 AM window consistency helpers.
 *   npx tsx scripts/check-slot-sync-cancelled.mjs
 */
import assert from "node:assert/strict";
import { slotMayBeDeleted, slotHasActiveBooking, syncSlotsForInstance } from "../src/lib/slotSync.ts";
import { generateSlotsForWindow } from "../src/lib/slotGeneration.ts";
import { scheduleWindowFromTimeInputs, scheduleWindowLabel } from "../src/lib/scheduleWindow.ts";

// --- Pure delete rules ---
assert.equal(
  slotMayBeDeleted({ id: "a", startMin: 1200, endMin: 1215, status: "AVAILABLE", booking: null }),
  true,
  "empty AVAILABLE slot may be deleted",
);
assert.equal(
  slotMayBeDeleted({
    id: "b",
    startMin: 1200,
    endMin: 1215,
    status: "AVAILABLE",
    booking: { cancelledAt: new Date() },
  }),
  true,
  "AVAILABLE slot with only a cancelled booking may be deleted (Eligio 8 PM orphan case)",
);
assert.equal(
  slotMayBeDeleted({
    id: "c",
    startMin: 1260,
    endMin: 1275,
    status: "AVAILABLE",
    booking: { cancelledAt: null },
  }),
  false,
  "active booking protects the slot",
);
assert.equal(
  slotHasActiveBooking({
    id: "d",
    startMin: 1260,
    endMin: 1275,
    status: "RESERVED",
    booking: { cancelledAt: new Date() },
  }),
  true,
  "RESERVED status still protects even if booking cancelled (stale safety)",
);

// --- Sync simulation: 8–11 PM grid shrinks to 9 PM–1 AM ---
const fri9to1 = scheduleWindowFromTimeInputs("21:00", "01:00");
assert.ok(fri9to1);
assert.equal(scheduleWindowLabel(fri9to1.startTimeMin, fri9to1.endTimeMin), "9:00 PM – 1:00 AM (next day)");

const desired = generateSlotsForWindow({
  startTimeMin: fri9to1.startTimeMin,
  endTimeMin: fri9to1.endTimeMin,
  slotMinutes: 15,
  breakMinutes: 0,
});
assert.equal(desired[0].startMin, 1260, "desired grid starts at 9:00 PM");

const existing = [
  // Orphan early slots with cancelled test bookings (the live bug).
  { id: "s8", startMin: 1200, endMin: 1215, status: "AVAILABLE", booking: { cancelledAt: new Date() } },
  { id: "s815", startMin: 1215, endMin: 1230, status: "AVAILABLE", booking: { cancelledAt: new Date() } },
  { id: "s830", startMin: 1230, endMin: 1245, status: "AVAILABLE", booking: { cancelledAt: new Date() } },
  { id: "s845", startMin: 1245, endMin: 1260, status: "AVAILABLE", booking: { cancelledAt: new Date() } },
  // One real slot that stays.
  { id: "s9", startMin: 1260, endMin: 1275, status: "AVAILABLE", booking: null },
];

const deleted = [];
const created = [];
const stubTx = {
  slot: {
    findMany: async () => existing,
    create: async ({ data }) => {
      created.push(data);
      return data;
    },
    update: async () => ({}),
    delete: async ({ where }) => {
      deleted.push(where.id);
      return {};
    },
  },
};

const stats = await syncSlotsForInstance(stubTx, "instance-1", desired);
assert.ok(deleted.includes("s8"), "8:00 PM orphan must be deleted");
assert.ok(deleted.includes("s815"), "8:15 PM orphan must be deleted");
assert.ok(deleted.includes("s830"), "8:30 PM orphan must be deleted");
assert.ok(deleted.includes("s845"), "8:45 PM orphan must be deleted");
assert.ok(!deleted.includes("s9"), "9:00 PM slot must remain");
assert.equal(stats.deleted, 4, "exactly four early orphans deleted");
assert.ok(created.length > 0, "later slots through 1 AM are created");
assert.ok(
  created.every((c) => c.startMin >= 1260),
  "no new slot starts before 9:00 PM",
);

console.log(JSON.stringify({ ok: true, checks: "slot-sync-cancelled", deleted: stats.deleted, created: stats.created }));
