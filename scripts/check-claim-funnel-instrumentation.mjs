/**
 * Claim funnel instrumentation + friction checks (no DB).
 * Run: npx tsx scripts/check-claim-funnel-instrumentation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLAIM_FUNNEL_EVENT,
  CLAIM_FUNNEL_INSTRUMENTED_AT,
  claimFailureFunnelEvent,
  claimFunnelEventFromClient,
} from "../src/lib/publicListings/claimFunnelEvents.ts";

{
  assert.equal(CLAIM_FUNNEL_EVENT.PAGE_VIEWED, "CLAIM_PAGE_VIEWED");
  assert.equal(CLAIM_FUNNEL_EVENT.ROLE_VENUE, "CLAIM_ROLE_SELECTED_VENUE");
  assert.equal(CLAIM_FUNNEL_EVENT.ROLE_HOST, "CLAIM_ROLE_SELECTED_HOST");
  assert.equal(CLAIM_FUNNEL_EVENT.FORM_STARTED, "CLAIM_FORM_STARTED");
  assert.equal(CLAIM_FUNNEL_EVENT.FORM_SUBMITTED, "CLAIM_FORM_SUBMITTED");
  assert.equal(CLAIM_FUNNEL_EVENT.COMPLETED, "CLAIM_COMPLETED");
  assert.equal(CLAIM_FUNNEL_EVENT.FAILED_VALIDATION, "CLAIM_FAILED_VALIDATION");
  assert.equal(CLAIM_FUNNEL_EVENT.FAILED_SESSION, "CLAIM_FAILED_SESSION");
  assert.equal(CLAIM_FUNNEL_EVENT.FAILED_OTHER, "CLAIM_FAILED_OTHER");
  assert.equal(claimFunnelEventFromClient("role_selected_venue"), CLAIM_FUNNEL_EVENT.ROLE_VENUE);
  assert.equal(claimFunnelEventFromClient("role_selected_host"), CLAIM_FUNNEL_EVENT.ROLE_HOST);
  assert.equal(claimFunnelEventFromClient("claim_form_started"), CLAIM_FUNNEL_EVENT.FORM_STARTED);
  assert.equal(claimFunnelEventFromClient("claim_completed"), null);
  assert.equal(claimFailureFunnelEvent({ status: 400, error: "Invitation session expired" }), CLAIM_FUNNEL_EVENT.FAILED_SESSION);
  assert.equal(claimFailureFunnelEvent({ status: 400, error: "Consent required" }), CLAIM_FUNNEL_EVENT.FAILED_VALIDATION);
  assert.equal(claimFailureFunnelEvent({ status: 500, error: "Claim failed" }), CLAIM_FUNNEL_EVENT.FAILED_OTHER);
}

{
  const helper = fs.readFileSync(new URL("../src/lib/publicListings/claimFunnelEvents.ts", import.meta.url), "utf8");
  assert.match(helper, /hasToken: Boolean/);
  assert.doesNotMatch(helper, /intendedEmail/);
  assert.doesNotMatch(helper, /ipAddress|userAgent|x-forwarded/i);
}

{
  const form = fs.readFileSync(new URL("../src/components/publicListings/InstantClaimForm.tsx", import.meta.url), "utf8");
  assert.match(form, /\/api\/claim\/funnel/);
  assert.match(form, /role_selected_venue/);
  assert.match(form, /claim_form_started/);
  assert.match(form, /fixed inset-x-0 bottom-0/);
  assert.match(form, /pb-24/);
  assert.doesNotMatch(form, /proofUrl|proof URL/);
  assert.doesNotMatch(form, /type="tel"|name="phone"/);
  assert.doesNotMatch(form, /name="notes"/);
  assert.match(form, /emailConfirmedFromInvite/);
  assert.match(form, /prefilledContactName/);
  assert.match(form, /I run this venue/);
  assert.match(form, /I host this open mic/);
  assert.match(form, /type="button"/);
  assert.match(form, /markStarted/);
  assert.ok(CLAIM_FUNNEL_INSTRUMENTED_AT.getTime() > 0);
}

{
  const invite = fs.readFileSync(new URL("../src/app/claim/invite/page.tsx", import.meta.url), "utf8");
  assert.match(invite, /CLAIM_FUNNEL_EVENT\.PAGE_VIEWED/);
  assert.match(invite, /CLAIM_FUNNEL_EVENT\.FAILED_SESSION/);
  assert.match(invite, /emailConfirmedFromInvite/);
  assert.match(invite, /usableInvitedClaimContactName/);
  assert.doesNotMatch(invite, /intendedEmailNormalized\}/);
}

{
  const token = fs.readFileSync(new URL("../src/app/claim/invite/[token]/route.ts", import.meta.url), "utf8");
  assert.match(token, /const sessionTtl = 60 \* 60 \* 2/);
  assert.doesNotMatch(token, /Math\.min\(60 \* 60 \* 2, remainingSec\)/);
}

{
  const instant = fs.readFileSync(new URL("../src/app/api/claim/instant/route.ts", import.meta.url), "utf8");
  assert.match(instant, /CLAIM_FUNNEL_EVENT\.FORM_SUBMITTED/);
  assert.match(instant, /CLAIM_FUNNEL_EVENT\.COMPLETED/);
  assert.match(instant, /intendedEmailNormalized/);
  assert.match(instant, /claimSession\?\.intendedEmailNormalized/);
}

{
  const reminders = fs.readFileSync(new URL("../src/lib/publicListings/claimInviteReminder.ts", import.meta.url), "utf8");
  assert.match(reminders, /CLAIM_PAGE_VIEWED/);
  assert.match(reminders, /CLAIM_COMPLETED/);
  assert.doesNotMatch(reminders, /CLAIM_SUBMIT_ATTEMPT/);
}

{
  const pipeline = fs.readFileSync(new URL("../src/app/api/cron/growth-pipeline/route.ts", import.meta.url), "utf8");
  assert.match(pipeline, /CLAIM_INVITE_REMINDERS_PER_CRON_MAX/);
  assert.match(pipeline, /runPendingListingClaimInviteReminders/);
}

{
  const runner = fs.readFileSync(new URL("../src/lib/publicListings/listingClaimInviteEmail.ts", import.meta.url), "utf8");
  assert.match(runner, /claimInviteReminderMaySend/);
}

{
  const miner = fs.readFileSync(new URL("../src/lib/publicListings/listingScheduleEnrichment.ts", import.meta.url), "utf8");
  assert.match(miner, /recordScheduleRecoveryDayStats/);
  assert.match(miner, /finally/);
}

console.log(JSON.stringify({ ok: true, checks: "claim-funnel-instrumentation" }));
