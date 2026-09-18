/**
 * Host night booking-status labels — FULL means every slot occupied.
 *   npm run test:host-night-status
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatHostNightBookingStatus,
  hostNightBookingCountsFromSlots,
  hostNightIsFullyBooked,
} from "../src/lib/host/hostNightBookingStatus.ts";
import { slotIsPubliclyBookable } from "../src/lib/signupLiveStatus.ts";

const avail = (extra = {}) => ({
  status: "AVAILABLE",
  bookingRestrictionModeOverride: null,
  booking: null,
  ...extra,
});

{
  const c = hostNightBookingCountsFromSlots([]);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
  assert.equal(hostNightIsFullyBooked(c), false);
}

{
  const c = hostNightBookingCountsFromSlots([avail(), avail(), avail()]);
  assert.equal(c.openBookable, 3);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

{
  const c = hostNightBookingCountsFromSlots([
    avail({ booking: { cancelledAt: null } }),
    avail(),
    avail(),
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 2);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked");
}

{
  const c = hostNightBookingCountsFromSlots([
    avail({ booking: { cancelledAt: null } }),
    avail({ booking: { cancelledAt: null } }),
    avail({ booking: { cancelledAt: null } }),
  ]);
  assert.equal(hostNightIsFullyBooked(c), true);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 3 performers booked");
}

// Cancelled booking on AVAILABLE → open
{
  const c = hostNightBookingCountsFromSlots([
    avail({ booking: { cancelledAt: new Date() } }),
    avail(),
  ]);
  assert.equal(c.openBookable, 2);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

// 1 booked + 1 HOUSE_ONLY empty → NOT FULL
{
  const c = hostNightBookingCountsFromSlots([
    avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    avail({ booking: { cancelledAt: null } }),
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 0);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked · No public spots open");
  assert.equal(
    slotIsPubliclyBookable({
      status: "AVAILABLE",
      bookingRestrictionModeOverride: "HOUSE_ONLY",
      booking: null,
    }),
    false,
  );
}

// 1 booked + 1 RESERVED empty → NOT FULL
{
  const c = hostNightBookingCountsFromSlots([
    { status: "RESERVED", bookingRestrictionModeOverride: null, booking: null },
    avail({ booking: { cancelledAt: null } }),
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 0);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked · No public spots open");
}

// CANCELLED slot → not public-open
{
  const c = hostNightBookingCountsFromSlots([
    { status: "CANCELLED", bookingRestrictionModeOverride: null, booking: null },
    avail(),
  ]);
  assert.equal(c.openBookable, 1);
  assert.equal(c.activeBooked, 0);
}

// Signup disabled / all HOUSE_ONLY empty → not FULL
{
  const c = hostNightBookingCountsFromSlots(
    [
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    ],
    { signupEnabled: false },
  );
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked · No public spots open");
}

// Signup disabled with 1 booked + restricted → occupancy, not FULL
{
  const c = hostNightBookingCountsFromSlots(
    [
      avail({ booking: { cancelledAt: null } }),
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    ],
    { signupEnabled: false },
  );
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked · No public spots open");
}

// Signup disabled but every slot occupied → FULL
{
  const c = hostNightBookingCountsFromSlots(
    [avail({ booking: { cancelledAt: null } }), avail({ booking: { cancelledAt: null } })],
    { signupEnabled: false },
  );
  assert.equal(hostNightIsFullyBooked(c), true);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 2 performers booked");
}

// Marvin-shaped: 7 booked + 7 public open → not FULL
{
  const slots = [
    ...Array.from({ length: 7 }, () => avail({ booking: { cancelledAt: null }, status: "RESERVED" })),
    ...Array.from({ length: 7 }, () => avail()),
  ];
  const c = hostNightBookingCountsFromSlots(slots, { signupEnabled: true });
  assert.equal(c.activeBooked, 7);
  assert.equal(c.totalSlots, 14);
  assert.equal(c.openBookable, 7);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "7 performers booked");
}

const statusSrc = readFileSync(new URL("../src/lib/host/hostNightBookingStatus.ts", import.meta.url), "utf8");
assert.match(statusSrc, /activeBooked === counts\.totalSlots/);
assert.match(statusSrc, /No public spots open/);

console.log(JSON.stringify({ ok: true, checks: "host-night-status" }));
