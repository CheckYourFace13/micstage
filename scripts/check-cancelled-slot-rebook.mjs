/**
 * Regression: cancelled Booking rows must not block rebooking; history preserved;
 * Host nights ignore venue booking windows; move/swap clears reminder state.
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
import {
  bookingBlockReason,
  publicSignupBookBlockReason,
} from "../src/lib/venueBookingRules.ts";

assert.equal(slotIsOpenForAssignment(null), true);
assert.equal(slotIsOpenForAssignment({ id: "b1", cancelledAt: new Date() }), true);
assert.equal(slotIsOpenForAssignment({ id: "b2", cancelledAt: null }), false);

const win = scheduleWindowFromTimeInputs("21:00", "01:00");
assert.ok(win);
const grid = generateSlotsForWindow({
  startTimeMin: win.startTimeMin,
  endTimeMin: win.endTimeMin,
  slotMinutes: 15,
  breakMinutes: 5,
});
const startsBefore = grid.slice(0, 4).map((s) => s.startMin);
const names = ["A", "B", "C", "D"];
const lineup = startsBefore.map((startMin, i) => ({ startMin, name: names[i] ?? null }));
lineup[1].name = null;
lineup[1].name = lineup[3].name;
lineup[3].name = null;
lineup[3].name = lineup[0].name;
lineup[0].name = null;
assert.deepEqual(lineup.map((r) => r.startMin), startsBefore);
assert.deepEqual(lineup.map((r) => r.name), [null, "D", "C", "A"]);

// --- Host night ignores venue bookingOpensDaysAhead ---
const venueStrict = {
  seriesStartDate: new Date("2020-01-01T00:00:00.000Z"),
  seriesEndDate: new Date("2020-12-31T00:00:00.000Z"),
  bookingOpensDaysAhead: 1,
  timeZone: "America/Los_Angeles",
};
const future = new Date("2099-06-15T00:00:00.000Z");
assert.ok(bookingBlockReason(venueStrict, future), "venue window should block far-future");
assert.equal(
  publicSignupBookBlockReason({
    isHostNight: true,
    hostSignupEnabled: true,
    venue: venueStrict,
    eventDate: future,
  }),
  null,
  "Host night must not inherit venue advance window",
);
assert.match(
  publicSignupBookBlockReason({
    isHostNight: true,
    hostSignupEnabled: false,
    venue: venueStrict,
    eventDate: future,
  }) ?? "",
  /not enabled/i,
);
assert.ok(
  publicSignupBookBlockReason({
    isHostNight: false,
    venue: venueStrict,
    eventDate: future,
  }),
  "pure venue night still uses venue window",
);

// --- History-preserving assign stub ---
const store = {
  slots: new Map([
    [
      "s1",
      {
        id: "s1",
        status: "AVAILABLE",
        booking: {
          id: "old",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          cancelledAt: new Date("2026-01-02T00:00:00Z"),
          musicianId: null,
          performerName: "Artist A",
          performerEmail: "a@example.com",
          notes: null,
          reminderEmail24hSentAt: new Date(),
          reminderEmail2hSentAt: null,
        },
      },
    ],
  ]),
  history: [],
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
    findFirst: async () => null,
    update: async ({ where, data }) => {
      const s = [...store.slots.values()].find((x) => x.booking?.id === where.id);
      Object.assign(s.booking, data);
      return s.booking;
    },
    updateMany: async () => ({ count: 0 }),
    delete: async ({ where }) => {
      const s = [...store.slots.values()].find((x) => x.booking?.id === where.id);
      const b = s.booking;
      s.booking = null;
      return b;
    },
    create: async ({ data }) => {
      const b = {
        id: "new-" + data.slotId,
        createdAt: new Date(),
        cancelledAt: null,
        reminderEmail24hSentAt: null,
        reminderEmail2hSentAt: null,
        ...data,
      };
      store.slots.get(data.slotId).booking = b;
      return b;
    },
  },
  bookingHistory: {
    findFirst: async () => null,
    create: async ({ data }) => {
      const row = { id: "h-" + store.history.length, ...data };
      store.history.push(row);
      return row;
    },
  },
};

const { assignActiveBookingToSlot, moveOrSwapBookingBetweenSlots, softCancelSlotBooking } =
  await import("../src/lib/bookingSlotAssign.ts");

const replaced = await assignActiveBookingToSlot(stubTx, "s1", {
  performerName: "Artist B",
  performerEmail: "b@example.com",
});
assert.equal(replaced.replacedCancelled, true);
assert.equal(store.history.length, 1);
assert.equal(store.history[0].performerName, "Artist A");
assert.equal(store.history[0].reason, "SUPERSEDED");
assert.equal(store.slots.get("s1").booking.performerName, "Artist B");
assert.equal(store.slots.get("s1").booking.id.startsWith("new-"), true);
assert.equal(store.slots.get("s1").booking.reminderEmail24hSentAt, null);

await softCancelSlotBooking(stubTx, "s1", "CANCELLED");
assert.ok(store.slots.get("s1").booking.cancelledAt);
assert.ok(store.history.some((h) => h.reason === "CANCELLED" && h.performerName === "Artist B"));

await assignActiveBookingToSlot(stubTx, "s1", { performerName: "Artist C" });
assert.equal(store.slots.get("s1").booking.performerName, "Artist C");
assert.ok(store.history.filter((h) => h.performerName === "Artist B").length >= 1);

// --- Move / swap with reminder clear ---
store.slots.set("sA", {
  id: "sA",
  instanceId: "inst1",
  startMin: 1260,
  status: "RESERVED",
  booking: {
    id: "ba",
    createdAt: new Date(),
    cancelledAt: null,
    musicianId: null,
    performerName: "Alpha",
    performerEmail: "alpha@ex.com",
    notes: null,
    reminderEmail24hSentAt: new Date(),
    reminderEmail2hSentAt: new Date(),
  },
});
store.slots.set("sB", {
  id: "sB",
  instanceId: "inst1",
  startMin: 1280,
  status: "AVAILABLE",
  booking: null,
});
store.slots.set("sC", {
  id: "sC",
  instanceId: "inst1",
  startMin: 1300,
  status: "RESERVED",
  booking: {
    id: "bc",
    createdAt: new Date(),
    cancelledAt: null,
    musicianId: null,
    performerName: "Charlie",
    performerEmail: "charlie@ex.com",
    notes: null,
    reminderEmail24hSentAt: new Date(),
    reminderEmail2hSentAt: null,
  },
});

const moveTx = {
  ...stubTx,
  slot: {
    findUnique: async ({ where }) => store.slots.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const s = store.slots.get(where.id);
      Object.assign(s, data);
      return s;
    },
  },
  booking: {
    ...stubTx.booking,
    update: async ({ where, data }) => {
      for (const s of store.slots.values()) {
        if (s.booking?.id === where.id) {
          Object.assign(s.booking, data);
          return s.booking;
        }
      }
      throw new Error("missing booking");
    },
  },
};

const moved = await moveOrSwapBookingBetweenSlots(moveTx, "sA", "sB", { allowSwap: false });
assert.equal(moved.ok, true);
assert.equal(moved.mode, "moved");
assert.equal(store.slots.get("sB").booking.performerName, "Alpha");
assert.equal(store.slots.get("sB").booking.reminderEmail24hSentAt, null);
assert.equal(moved.notify[0].fromStartMin, 1260);
assert.equal(moved.notify[0].toStartMin, 1280);

const swapped = await moveOrSwapBookingBetweenSlots(moveTx, "sB", "sC", { allowSwap: true });
assert.equal(swapped.ok, true);
assert.equal(swapped.mode, "swapped");
assert.equal(store.slots.get("sB").booking.performerName, "Charlie");
assert.equal(store.slots.get("sC").booking.performerName, "Alpha");
assert.equal(store.slots.get("sB").booking.reminderEmail24hSentAt, null);
assert.equal(store.slots.get("sC").booking.reminderEmail24hSentAt, null);
assert.equal(swapped.notify.length, 2);

const live = computeSignupLiveStatus({
  signupEnabled: true,
  hasScheduleInstance: true,
  slots: [{ status: "AVAILABLE", booking: null }],
  nightId: "n1",
});
assert.equal(live.live, true);

console.log(JSON.stringify({ ok: true, checks: "rebook-history + host-window + move-reminders" }));
