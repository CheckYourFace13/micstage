/**
 * Host night booking-status labels aligned with public bookability.
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
  assert.equal(c.activeBooked, 0);
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
  assert.equal(c.activeBooked, 3);
  assert.equal(c.openBookable, 0);
  assert.equal(hostNightIsFullyBooked(c), true);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 3 performers booked");
}

// Cancelled booking on AVAILABLE → open
{
  const c = hostNightBookingCountsFromSlots([
    avail({ booking: { cancelledAt: new Date() } }),
    avail(),
  ]);
  assert.equal(c.activeBooked, 0);
  assert.equal(c.openBookable, 2);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

// HOUSE_ONLY → not public-open
{
  const c = hostNightBookingCountsFromSlots([
    avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    avail({ booking: { cancelledAt: null } }),
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 0);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 1 performer booked");
  assert.equal(
    slotIsPubliclyBookable({
      status: "AVAILABLE",
      bookingRestrictionModeOverride: "HOUSE_ONLY",
      booking: null,
    }),
    false,
  );
}

// RESERVED empty → not public-open
{
  const c = hostNightBookingCountsFromSlots([
    { status: "RESERVED", bookingRestrictionModeOverride: null, booking: null },
    avail({ booking: { cancelledAt: null } }),
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 0);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 1 performer booked");
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

// Signup disabled with empty AVAILABLE slots → not falsely FULL
{
  const c = hostNightBookingCountsFromSlots(
    [
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    ],
    { signupEnabled: false },
  );
  assert.equal(c.openBookable, 0);
  assert.equal(c.activeBooked, 0);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

// Signup disabled with bookings → occupancy label, not FULL
{
  const c = hostNightBookingCountsFromSlots(
    [
      avail({ booking: { cancelledAt: null } }),
      avail({ bookingRestrictionModeOverride: "HOUSE_ONLY" }),
    ],
    { signupEnabled: false },
  );
  assert.equal(c.activeBooked, 1);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked");
}

const panel = readFileSync(new URL("../src/components/host/HostDeleteNightPanel.tsx", import.meta.url), "utf8");
assert.match(panel, /compact \? "Remove night"/);

const statusSrc = readFileSync(new URL("../src/lib/host/hostNightBookingStatus.ts", import.meta.url), "utf8");
assert.match(statusSrc, /slotIsPubliclyBookable/);
assert.match(statusSrc, /slotHasActiveBooking/);

console.log(JSON.stringify({ ok: true, checks: "host-night-status" }));
