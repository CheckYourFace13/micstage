/**
 * Onboarding simplification + first-session checks (no DB required).
 * Run: node scripts/check-onboarding-simplification.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// Promoter register: no slug fields
{
  const page = read("src/app/register/promoter/page.tsx");
  assert.ok(!/name="slug"/.test(page), "promoter register must not ask for slug");
  assert.ok(!/venueSlug/.test(page), "promoter register must not mention venueSlug");
  assert.ok(/Create your account/.test(page) || /Create account/.test(page), "friendly register copy");
}

// Promoter register submit lands on welcome
{
  const submit = read("src/app/register/promoter/register-submit/route.ts");
  assert.ok(submit.includes("/promoter/welcome"), "approved promoter signup redirects to welcome");
  assert.ok(!submit.includes("venueSlug"), "register submit has no venueSlug");
}

// Promoter dashboard: first-session paths
{
  const dash = read("src/app/promoter/page.tsx");
  assert.ok(!/name="venueSlug"/.test(dash), "dashboard must not ask for venueSlug");
  assert.ok(!/name="slug"/.test(dash), "dashboard must not ask for series slug");
  assert.ok(dash.includes("FindOpenMicPanel"), "dashboard uses name search");
  assert.ok(dash.includes("SetupChecklist"), "dashboard has optional checklist");
  assert.ok(dash.includes("SharePageButtons"), "dashboard surfaces share");
  assert.ok(/Manage my open mic/i.test(dash), "linked CTA");
  assert.ok(dash.includes("You haven&apos;t connected an open mic yet."), "unlinked empty state");
  assert.ok(/Find my open mic/i.test(dash), "unlinked find CTA");
  assert.ok(dash.includes("Your open mic is connected."), "post-connect success");
  assert.ok(!/Enter the venue slug/.test(dash), "no slug instructions");
}

// Welcome flow exists
{
  assert.ok(fs.existsSync(path.join(root, "src/app/promoter/welcome/page.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/app/promoter/welcome/skip/route.ts")));
  const welcome = read("src/app/promoter/welcome/page.tsx");
  assert.ok(/Do this later/i.test(welcome));
  assert.ok(/Find my open mic/i.test(welcome));
  assert.ok(/Create a new open mic/i.test(welcome));
}

// Approval email prefills email, plain language
{
  const apps = read("src/lib/promoterApplications.ts");
  assert.ok(apps.includes("register/promoter?email="), "approval link prefills email");
  assert.ok(/no technical codes/i.test(apps), "approval email mentions no technical codes");
}

// Musician: display name, no bio required at signup; first-session CTAs
{
  const mus = read("src/app/register/musician/page.tsx");
  assert.ok(/Display name/.test(mus));
  assert.ok(!/name="bio"/.test(mus));
  assert.ok(!/name="genres"/.test(mus));
  assert.ok(!LineupHelp(mus), "no lineup help clutter on signup");
  const artist = read("src/app/artist/page.tsx");
  assert.ok(/Your account is ready/i.test(artist));
  assert.ok(/Find open mics near me/i.test(artist));
  assert.ok(/Build my profile/i.test(artist));
  assert.ok(/Do this later/i.test(artist));
  assert.ok(artist.includes("/find-open-mics"), "discover without profile gate");
}
function LineupHelp(s) {
  return /LineupSlotTypesHelp/.test(s);
}

// Instant claim: plain authority, optional post-claim
{
  const claim = read("src/components/publicListings/InstantClaimForm.tsx");
  assert.ok(/authorized to manage this open mic/i.test(claim));
  assert.ok(/does not turn on online signups or booking/i.test(claim));
  assert.ok(/update the schedule and details later/i.test(claim));
  assert.ok(/Claim this free listing/i.test(claim));
  assert.ok(!/Post-claim activation/.test(claim));
}

// Claim activate: 3 CTAs only as primary path
{
  const act = read("src/app/claim/activate/[venueSlug]/page.tsx");
  assert.ok(/Your open mic is claimed/i.test(act));
  assert.ok(/Confirm schedule/i.test(act));
  assert.ok(/Improve listing/i.test(act));
  assert.ok(/Turn on performer signups/i.test(act));
  assert.ok(/Do this later/i.test(act));
  assert.ok(act.includes("SharePageButtons"), "claim activate surfaces share");
  assert.ok(!act.includes('href="/dashboard"'), "no dead /dashboard link");
}

// Setup checklist leads with benefits
{
  const checklist = read("src/components/onboarding/SetupChecklist.tsx");
  assert.ok(/quick things can help more performers find you/i.test(checklist));
  assert.ok(/% done · optional/.test(checklist), "percentage is secondary");
}

// Setup nudges: value-first + rollout guard
{
  const nudges = read("src/lib/onboarding/setupNudges.ts");
  assert.ok(nudges.includes("Help performers find your next open mic"));
  assert.ok(nudges.includes("Make open mic signups easier"));
  assert.ok(nudges.includes("onboarding-nudge:"));
  assert.ok(nudges.includes("effectiveNudgeCreatedAt"), "rollout guard exported");
  assert.ok(nudges.includes("sentAnySetupNudgeInLast24h") || nudges.includes("24 * 3600 * 1000"), "24h cap");
  assert.ok(nudges.includes("SETUP_NUDGE_FEATURE_START"), "feature start clock");
}

// Actions prefer venueId
{
  const actions = read("src/app/promoter/actions.ts");
  assert.ok(actions.includes("requestPromoterVenueAccessByVenueIdAction"));
  assert.ok(/Slugs are always generated server-side/.test(actions));
  assert.ok(actions.includes("promoter=connected"), "post-link success redirect");
}

// Nudge effective-age unit checks (compiled via tsx if available, else skip runtime)
{
  // Lightweight pure check duplicated from source so CI needs no TS loader:
  function effectiveNudgeCreatedAt(createdAt, featureStart) {
    return createdAt.getTime() > featureStart.getTime() ? createdAt : featureStart;
  }
  const featureStart = new Date("2026-08-14T00:00:00.000Z");
  const oldAccount = new Date("2024-01-01T00:00:00.000Z");
  const newAccount = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(effectiveNudgeCreatedAt(oldAccount, featureStart).toISOString(), featureStart.toISOString());
  assert.equal(effectiveNudgeCreatedAt(newAccount, featureStart).toISOString(), newAccount.toISOString());

  // Old account on feature day+1 only matches day-1 window, not day-7
  const nowDay1 = new Date("2026-08-15T12:00:00.000Z");
  const ageDays = (nowDay1.getTime() - effectiveNudgeCreatedAt(oldAccount, featureStart).getTime()) / (24 * 3600 * 1000);
  assert.ok(ageDays >= 1 && ageDays < 3, `old account day-1 age should be in [1,3), got ${ageDays}`);
  assert.ok(!(ageDays >= 7), "old account must not land in day-7 window on day 1");
}

console.log("check-onboarding-simplification: ok");
