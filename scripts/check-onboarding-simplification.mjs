/**
 * Onboarding simplification checks (no DB required).
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

// Promoter dashboard: no slug input
{
  const dash = read("src/app/promoter/page.tsx");
  assert.ok(!/name="venueSlug"/.test(dash), "dashboard must not ask for venueSlug");
  assert.ok(!/name="slug"/.test(dash), "dashboard must not ask for series slug");
  assert.ok(dash.includes("FindOpenMicPanel"), "dashboard uses name search");
  assert.ok(dash.includes("SetupChecklist"), "dashboard has optional checklist");
  assert.ok(!/Enter the venue slug/.test(dash), "no slug instructions");
}

// Welcome flow exists
{
  assert.ok(fs.existsSync(path.join(root, "src/app/promoter/welcome/page.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/app/promoter/welcome/skip/route.ts")));
  const welcome = read("src/app/promoter/welcome/page.tsx");
  assert.ok(/I'll do this later|I&apos;ll do this later/.test(welcome));
  assert.ok(/Set up my open mic/.test(welcome));
}

// Approval email prefills email, plain language
{
  const apps = read("src/lib/promoterApplications.ts");
  assert.ok(apps.includes("register/promoter?email="), "approval link prefills email");
  assert.ok(/no technical codes/i.test(apps), "approval email mentions no technical codes");
}

// Musician: display name, no bio required at signup
{
  const mus = read("src/app/register/musician/page.tsx");
  assert.ok(/Display name/.test(mus));
  assert.ok(!/name="bio"/.test(mus));
  assert.ok(!/name="genres"/.test(mus));
  assert.ok(!LineupHelp(mus), "no lineup help clutter on signup");
}
function LineupHelp(s) {
  return /LineupSlotTypesHelp/.test(s);
}

// Instant claim: plain authority, optional post-claim
{
  const claim = read("src/components/publicListings/InstantClaimForm.tsx");
  assert.ok(/authorized to manage this open mic/i.test(claim));
  assert.ok(/Schedule, photos, and booking stay optional/i.test(claim));
  assert.ok(!/Post-claim activation/.test(claim));
}

// Claim activate success copy
{
  const act = read("src/app/claim/activate/[venueSlug]/page.tsx");
  assert.ok(/Your open mic is claimed/.test(act));
  assert.ok(/I'll do this later|I&apos;ll do this later/.test(act));
}

// Setup nudges exist and are value-first
{
  const nudges = read("src/lib/onboarding/setupNudges.ts");
  assert.ok(nudges.includes("Help performers find your next open mic"));
  assert.ok(nudges.includes("Make open mic signups easier"));
  assert.ok(nudges.includes("onboarding-nudge:"));
}

// Actions prefer venueId
{
  const actions = read("src/app/promoter/actions.ts");
  assert.ok(actions.includes("requestPromoterVenueAccessByVenueIdAction"));
  assert.ok(/Slugs are always generated server-side/.test(actions));
}

console.log("check-onboarding-simplification: ok");
