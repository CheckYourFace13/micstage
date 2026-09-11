/**
 * Regression: cancelled Booking rows must not block rebooking (Booking.slotId UNIQUE).
 * Also covers move/swap without changing schedule grid, and signup LIVE truthfulness.
 *   npx tsx scripts/check-cancelled-slot-rebook.mjs
 */
import assert from "node:assert/strict";
import {
  activeBookingFrom,
  slotIsOpenForAssignment,
} from "../src/lib/bookingSlotAssign.ts";
import { computeSignupLiveStatus } from "../src/lib/signupLiveStatus.ts";
import { generateSlotsForWindow } from "../src/lib/slotGeneration.ts";
import { scheduleWindowFromTimeInputs } from "../src/lib/scheduleWindow.ts";

// --- Open-slot helpers ---
assert.equal(slotIsOpenForAssignment(null), true);
assert.equal(slotIsOpenForAssignment({ id: "b1", cancelledAt: new Date() }), true);
assert.equal(slotIsOpenForAssignment({ id: "b2", cancelledAt: null }), false);
assert.equal(activeBookingFrom({ id: "b3", cancelledAt: new Date() }), null);
assert.ok(activeBookingFrom({ id: "b4", cancelledAt: null, performerName: "A" }));

// --- Schedule grid stays fixed for 9 PM–1 AM / 15 / every 20 ---
const win = scheduleWindowFromTimeInputs("21:00", "01:00");
assert.ok(win);
const grid = generateSlotsForWindow({
  startTimeMin: win.startTimeMin,
  endTimeMin: win.endTimeMin,
  slotMinutes: 15,
  breakMinutes: 5,
});
assert.equal(grid[0].startMin, 21 * 60);
assert.equal(grid[1].startMin, 21 * 60 + 20);
assert.equal(grid[2].startMin, 21 * 60 + 40);
assert.equal(grid[3].startMin, 22 * 60);
const startsBefore = grid.slice(0, 4).map((s) => s.startMin);
assert.equal(startsBefore.length, 4);

// Simulated move: performer payloads move; start minutes unchanged.
const names = ["A", "B", "C", "D"];
const lineup = startsBefore.map((startMin, i) => ({ startMin, name: names[i] ?? null }));
// remove B
lineup[1].name = null;
// move D to 9:20
lineup[1].name = lineup[3].name;
lineup[3].name = null;
// move A to 10:00
lineup[3].name = lineup[0].name;
lineup[0].name = null;
assert.deepEqual(
  lineup.map((r) => r.startMin),
  startsBefore,
  "moving names must not alter start times",
);
assert.deepEqual(
  lineup.map((r) => r.name),
  [null, "D", "C", "A"],
);

// --- assignActiveBookingToSlot behavior via stub tx ---
const store = {
  slots: new Map([
    [
      "s1",
      {
        id: "s1",
        status: "AVAILABLE",
        booking: {
          id: "old",
          cancelledAt: new Date(),
          musicianId: null,
          performerName: "Artist A",
          performerEmail: "a@example.com",
          notes: null,
        },
      },
    ],
  ]),
  bookings: new Map(),
};

const stubTx = {
  slot: {
    findUnique: async ({ where }) => store.slots.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const s = store.slots.get(where.id);
      Object.assign(s, data);
      return s;
    },
  },
  booking: {
    update: async ({ where, data }) => {
      const s = [...store.slots.values()].find((x) => x.booking?.id === where.id);
      Object.assign(s.booking, data);
      return s.booking;
    },
    updateMany: async ({ where, data }) => {
      const s = store.slots.get(where.slotId);
      if (s?.booking && (where.cancelledAt === null ? s.booking.cancelledAt == null : true)) {
        Object.assign(s.booking, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
    create: async ({ data }) => {
      throw new Error("create must not run when cancelled row exists — would hit UNIQUE(slotId)");
    },
  },
};

const { assignActiveBookingToSlot, moveOrSwapBookingBetweenSlots, softCancelSlotBooking } =
  await import("../src/lib/bookingSlotAssign.ts");

const reused = await assignActiveBookingToSlot(stubTx, "s1", {
  performerName: "Artist B",
  performerEmail: "b@example.com",
});
assert.equal(reused.reusedCancelled, true);
assert.equal(store.slots.get("s1").booking.performerName, "Artist B");
assert.equal(store.slots.get("s1").booking.cancelledAt, null);
assert.equal(store.slots.get("s1").status, "RESERVED");

// Soft-cancel then reopen for another artist
await softCancelSlotBooking(stubTx, "s1");
assert.ok(store.slots.get("s1").booking.cancelledAt);
assert.equal(store.slots.get("s1").status, "AVAILABLE");
const reused2 = await assignActiveBookingToSlot(stubTx, "s1", { performerName: "Artist C" });
assert.equal(reused2.reusedCancelled, true);
assert.equal(store.slots.get("s1").booking.performerName, "Artist C");

// --- Move / swap stubs ---
store.slots.set("sA", {
  id: "sA",
  instanceId: "inst1",
  status: "RESERVED",
  booking: {
    id: "ba",
    cancelledAt: null,
    musicianId: null,
    performerName: "Alpha",
    performerEmail: null,
    notes: null,
  },
});
store.slots.set("sB", {
  id: "sB",
  instanceId: "inst1",
  status: "AVAILABLE",
  booking: null,
});
store.slots.set("sC", {
  id: "sC",
  instanceId: "inst1",
  status: "RESERVED",
  booking: {
    id: "bc",
    cancelledAt: null,
    musicianId: null,
    performerName: "Charlie",
    performerEmail: null,
    notes: null,
  },
});

const moveTx = {
  slot: {
    findUnique: async ({ where }) => store.slots.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const s = store.slots.get(where.id);
      Object.assign(s, data);
      return s;
    },
  },
  booking: {
    update: async ({ where, data }) => {
      for (const s of store.slots.values()) {
        if (s.booking?.id === where.id) {
          Object.assign(s.booking, data);
          return s.booking;
        }
      }
      throw new Error("missing booking");
    },
    updateMany: async ({ where, data }) => {
      const s = store.slots.get(where.slotId);
      if (s?.booking && s.booking.cancelledAt == null) {
        Object.assign(s.booking, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
    create: async ({ data }) => {
      const b = { id: "new-" + data.slotId, cancelledAt: null, ...data };
      store.slots.get(data.slotId).booking = b;
      return b;
    },
  },
};

const moved = await moveOrSwapBookingBetweenSlots(moveTx, "sA", "sB", { allowSwap: false });
assert.equal(moved.ok, true);
assert.equal(moved.mode, "moved");
assert.equal(store.slots.get("sA").booking.cancelledAt != null, true);
assert.equal(store.slots.get("sB").booking.performerName, "Alpha");

const conflict = await moveOrSwapBookingBetweenSlots(moveTx, "sB", "sC", { allowSwap: false });
assert.equal(conflict.ok, false);
assert.equal(conflict.reason, "dest_taken");

const swapped = await moveOrSwapBookingBetweenSlots(moveTx, "sB", "sC", { allowSwap: true });
assert.equal(swapped.ok, true);
assert.equal(swapped.mode, "swapped");
assert.equal(store.slots.get("sB").booking.performerName, "Charlie");
assert.equal(store.slots.get("sC").booking.performerName, "Alpha");

// --- Signup LIVE status ---
const live = computeSignupLiveStatus({
  signupEnabled: true,
  hasScheduleInstance: true,
  slots: [
    { status: "AVAILABLE", booking: null },
    { status: "AVAILABLE", booking: { cancelledAt: new Date() } },
    { status: "RESERVED", booking: { cancelledAt: null } },
  ],
  nightId: "n1",
});
assert.equal(live.live, true);
assert.equal(live.openSpots, 2);
assert.match(live.headline, /LIVE/);

const notLive = computeSignupLiveStatus({
  signupEnabled: false,
  hasScheduleInstance: true,
  slots: [{ status: "AVAILABLE", booking: null }],
  nightId: "n1",
});
assert.equal(notLive.live, false);
assert.ok(notLive.blockers.some((b) => /turned off/i.test(b)));

const full = computeSignupLiveStatus({
  signupEnabled: true,
  hasScheduleInstance: true,
  slots: [{ status: "RESERVED", booking: { cancelledAt: null } }],
  nightId: "n1",
});
assert.equal(full.live, false);
assert.ok(full.blockers.some((b) => /filled|open/i.test(b)));

console.log(JSON.stringify({ ok: true, checks: "cancelled-slot-rebook + move/swap + signup-live" }));
