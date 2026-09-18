/**
 * Host night booking-status labels (UI clarity).
 *   npm run test:host-night-status
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatHostNightBookingStatus,
  hostNightBookingCountsFromSlots,
  hostNightIsFullyBooked,
} from "../src/lib/host/hostNightBookingStatus.ts";

{
  const c = hostNightBookingCountsFromSlots([]);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
  assert.equal(hostNightIsFullyBooked(c), false);
}

{
  const c = hostNightBookingCountsFromSlots([
    { booking: null },
    { booking: null },
    { booking: null },
  ]);
  assert.equal(c.activeBooked, 0);
  assert.equal(c.openBookable, 3);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

{
  const c = hostNightBookingCountsFromSlots([
    { booking: { cancelledAt: null } },
    { booking: null },
    { booking: null },
  ]);
  assert.equal(c.activeBooked, 1);
  assert.equal(c.openBookable, 2);
  assert.equal(hostNightIsFullyBooked(c), false);
  assert.equal(formatHostNightBookingStatus(c), "1 performer booked");
}

{
  const c = hostNightBookingCountsFromSlots([
    { booking: { cancelledAt: null } },
    { booking: { cancelledAt: null } },
    { booking: { cancelledAt: null } },
  ]);
  assert.equal(c.activeBooked, 3);
  assert.equal(c.openBookable, 0);
  assert.equal(hostNightIsFullyBooked(c), true);
  assert.equal(formatHostNightBookingStatus(c), "FULL · 3 performers booked");
}

{
  const c = hostNightBookingCountsFromSlots([
    { booking: { cancelledAt: new Date() } },
    { booking: null },
  ]);
  assert.equal(c.activeBooked, 0);
  assert.equal(c.openBookable, 2);
  assert.equal(formatHostNightBookingStatus(c), "No performers booked");
}

const panel = readFileSync(new URL("../src/components/host/HostDeleteNightPanel.tsx", import.meta.url), "utf8");
assert.match(panel, /compact \? "Remove night"/);
assert.match(panel, /Cancel night & notify/);
assert.match(panel, /Delete this night\?/);

const form = readFileSync(new URL("../src/components/host/HostAddNightForm.tsx", import.meta.url), "utf8");
assert.match(form, /bookingStatusLabel/);

console.log(JSON.stringify({ ok: true, checks: "host-night-status" }));
