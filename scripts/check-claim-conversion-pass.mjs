/**
 * Unit checks for claim reminder eligibility and schedule rotation.
 * Run: npx tsx scripts/check-claim-conversion-pass.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  claimInviteReminderEligibility,
  classifyClaimInviteEngagement,
  reminderLanePriority,
} from "../src/lib/publicListings/claimInviteReminder.ts";
import { usableInvitedClaimContactName } from "../src/lib/publicListings/claimInviteSession.ts";
import { rotateUnscheduledBatch } from "../src/lib/publicListings/listingScheduleEnrichment.ts";
import { buildListingClaimInvitePayload } from "../src/lib/publicListings/listingClaimInviteEmail.ts";

const now = new Date("2026-10-27T12:00:00.000Z");

{
  const tooSoon = claimInviteReminderEligibility({
    sentAt: new Date("2026-10-26T12:00:00.000Z"),
    claimed: false,
    alreadyReminded: false,
    bounced: false,
    complained: false,
    unsubscribed: false,
    clicked: false,
    completed: false,
    now,
  });
  assert.equal(tooSoon.eligible, false);
  assert.equal(tooSoon.reason, "too_recent");
}

{
  const neverClicked = claimInviteReminderEligibility({
    sentAt: new Date("2026-10-19T12:00:00.000Z"),
    claimed: false,
    alreadyReminded: false,
    bounced: false,
    complained: false,
    unsubscribed: false,
    clicked: false,
    completed: false,
    now,
  });
  assert.equal(neverClicked.eligible, true);
  assert.equal(neverClicked.lane, "never_clicked");
}

{
  const clicked = claimInviteReminderEligibility({
    sentAt: new Date("2026-10-23T12:00:00.000Z"),
    claimed: false,
    alreadyReminded: false,
    bounced: false,
    complained: false,
    unsubscribed: false,
    clicked: true,
    completed: false,
    now,
  });
  assert.equal(clicked.eligible, true);
  assert.equal(clicked.lane, "clicked_not_completed");
  assert.ok(reminderLanePriority("clicked_not_completed") > reminderLanePriority("never_clicked"));
}

{
  const bounced = claimInviteReminderEligibility({
    sentAt: new Date("2026-10-01T12:00:00.000Z"),
    claimed: false,
    alreadyReminded: false,
    bounced: true,
    complained: false,
    unsubscribed: false,
    clicked: false,
    completed: false,
    now,
  });
  assert.equal(bounced.eligible, false);
  assert.equal(bounced.reason, "bounced");
}

{
  const reminded = claimInviteReminderEligibility({
    sentAt: new Date("2026-10-01T12:00:00.000Z"),
    claimed: false,
    alreadyReminded: true,
    bounced: false,
    complained: false,
    unsubscribed: false,
    clicked: false,
    completed: false,
    now,
  });
  assert.equal(reminded.eligible, false);
  assert.equal(reminded.reason, "already_reminded");
}

{
  const ids = Array.from({ length: 10 }, (_, i) => ({ id: `id-${String(i).padStart(2, "0")}`, score: i === 9 ? 100 : i }));
  const first = rotateUnscheduledBatch(ids, null, 4, (r) => r.score);
  assert.equal(first.batch.length, 4);
  assert.ok(first.batch.some((r) => r.id === "id-09"), "priority fill includes high score");
  const second = rotateUnscheduledBatch(ids, first.nextCursorId, 4, (r) => r.score);
  assert.notEqual(second.nextCursorId, first.nextCursorId);
  const seen = new Set();
  let cursor = null;
  for (let i = 0; i < 8; i += 1) {
    const step = rotateUnscheduledBatch(ids, cursor, 2, (r) => r.score);
    for (const row of step.batch) seen.add(row.id);
    cursor = step.nextCursorId;
  }
  assert.ok(seen.size >= 8, `rotation should cover most inventory, got ${seen.size}`);
}

{
  const mail = buildListingClaimInvitePayload({
    listingName: "Blue Note Open Mic",
    listingSlug: "blue-note-open-mic",
    city: "Chicago",
    region: "IL",
    claimUrl: "https://micstage.com/claim/invite/token",
  });
  assert.match(mail.subject, /Claim your open mic on MicStage — free/);
  assert.match(mail.htmlBody, /Claim this open mic/);
  assert.match(mail.textBody, /We found your open mic on MicStage/);
  assert.match(mail.textBody, /No credit card/);
  assert.doesNotMatch(mail.htmlBody, /Claim your listing free/);
  const reminder = buildListingClaimInvitePayload({
    listingName: "Blue Note Open Mic",
    listingSlug: "blue-note-open-mic",
    city: "Chicago",
    region: "IL",
    claimUrl: "https://micstage.com/claim/invite/token",
    isReminder: true,
  });
  assert.match(reminder.subject, /^Reminder:/);
  assert.match(reminder.htmlBody, /https:\/\/micstage.com\/claim\/invite\/token/);
  const runner = fs.readFileSync(new URL("../src/lib/publicListings/listingClaimInviteEmail.ts", import.meta.url), "utf8");
  assert.match(runner, /claim\/invite\/\$\{issued\.rawToken\}/);
}

{
  const form = fs.readFileSync(new URL("../src/components/publicListings/InstantClaimForm.tsx", import.meta.url), "utf8");
  assert.match(form, /I run this venue/);
  assert.match(form, /I host this open mic/);
  assert.match(form, /emailConfirmedFromInvite/);
  assert.match(form, /prefilledContactName/);
  assert.match(form, /You get this listing and can fix the schedule/);
  assert.match(form, /You can run this night without owning the room/);
  assert.match(form, /type="button"/);
  const token = fs.readFileSync(new URL("../src/lib/publicListings/claimInviteToken.ts", import.meta.url), "utf8");
  assert.match(token, /reviveExpiredClaimInviteTokenIfClaimable/);
}

{
  const clicked = classifyClaimInviteEngagement(["CLAIM_PAGE_VIEWED"]);
  assert.equal(clicked.clicked, true);
  assert.equal(clicked.completed, false);
  const submittedOnly = classifyClaimInviteEngagement(["CLAIM_SUBMIT_ATTEMPT"]);
  assert.equal(submittedOnly.completed, false);
  const done = classifyClaimInviteEngagement(["CLAIM_COMPLETED"]);
  assert.equal(done.completed, true);
}

{
  assert.equal(
    usableInvitedClaimContactName({ hostName: "Jane Host", growthLeadName: "Some Venue", listingName: "Open Mic" }),
    "Jane Host",
  );
  assert.equal(
    usableInvitedClaimContactName({ hostName: null, growthLeadName: "Lincoln Avenue Brewery", listingName: "Lincoln Avenue Brewery Open Mic" }),
    "Lincoln Avenue Brewery",
  );
  assert.equal(usableInvitedClaimContactName({ listingName: "Open Mic Night" }), null);
}

console.log(JSON.stringify({ ok: true, checks: "claim-conversion-pass" }));
