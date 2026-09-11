/**
 * Cancel-notification decision matrix + move/swap must not use cancel mails.
 *   npm run test:booking-cancel-notify
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planBookingCancelNotify } from "../src/lib/bookingNotify.ts";

// Performer cancels → both sides when emails exist
{
  const p = planBookingCancelNotify({
    initiator: "performer",
    performerEmail: "a@example.com",
    organizerEmail: "h@example.com",
  });
  assert.equal(p.sendPerformer, true);
  assert.equal(p.sendOrganizer, true);
  assert.equal(p.performerKind, "confirm");
}

// Host/Venue removes → performer only
{
  const p = planBookingCancelNotify({
    initiator: "organizer",
    performerEmail: "a@example.com",
    organizerEmail: "h@example.com",
  });
  assert.equal(p.sendPerformer, true);
  assert.equal(p.sendOrganizer, false);
  assert.equal(p.performerKind, "removed");
}

// Manual / no email → no performer mail, no failure path
{
  const p = planBookingCancelNotify({
    initiator: "organizer",
    performerEmail: null,
    organizerEmail: "h@example.com",
  });
  assert.equal(p.sendPerformer, false);
  assert.equal(p.sendOrganizer, false);
  assert.equal(p.performerKind, null);
}

// Performer cancel without organizer email → performer only
{
  const p = planBookingCancelNotify({
    initiator: "performer",
    performerEmail: "a@example.com",
    organizerEmail: "not-an-email",
  });
  assert.equal(p.sendPerformer, true);
  assert.equal(p.sendOrganizer, false);
}

// Move/swap call sites must use time-change only (no cancel notify on MOVED_AWAY)
const nightActions = readFileSync(new URL("../src/app/promoter/night-actions.ts", import.meta.url), "utf8");
assert.match(nightActions, /notifyBookingTimeChanged/);
assert.match(nightActions, /hostMoveBookingAction[\s\S]*notifyBookingTimeChanged/);
assert.doesNotMatch(
  nightActions.slice(nightActions.indexOf("hostMoveBookingAction"), nightActions.indexOf("hostMoveBookingAction") + 2500),
  /notifyBookingCancelled/,
);

const venueActions = readFileSync(new URL("../src/app/venue/actions.ts", import.meta.url), "utf8");
const moveIdx = venueActions.indexOf("moveVenueBookingAction");
assert.ok(moveIdx > 0);
assert.doesNotMatch(venueActions.slice(moveIdx, moveIdx + 2500), /notifyBookingCancelled/);
assert.match(venueActions.slice(moveIdx, moveIdx + 2500), /notifyBookingTimeChanged/);

// softCancel MOVED_AWAY path must not be wired to cancel emails in bookingSlotAssign
const slotAssign = readFileSync(new URL("../src/lib/bookingSlotAssign.ts", import.meta.url), "utf8");
assert.doesNotMatch(slotAssign, /notifyBookingCancelled|bookingNotify/);
assert.match(slotAssign, /MOVED_AWAY/);

// cancel-submit + host remove must wire cancel notify
const cancelSubmit = readFileSync(
  new URL("../src/app/venues/[venueSlug]/cancel-submit/route.ts", import.meta.url),
  "utf8",
);
assert.match(cancelSubmit, /notifyBookingCancelledById/);
assert.match(cancelSubmit, /softCancelSlotBooking/);
assert.match(nightActions, /hostRemoveBookingAction[\s\S]*notifyBookingCancelledById/);

// Schema stamps exist for idempotency
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
assert.match(schema, /cancelNotifyPerformerSentAt/);
assert.match(schema, /cancelNotifyOrganizerSentAt/);

console.log(JSON.stringify({ ok: true, checks: "booking-cancel-notify" }));
