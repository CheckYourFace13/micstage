/**
 * Static checks for GA4 conversion event wiring.
 * Run: node scripts/check-conversion-analytics.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const conversionEvents = [
  "listing_claim_cta_click",
  "venue_claim_start",
  "venue_claim_complete",
  "venue_registration_complete",
  "host_registration_complete",
  "host_first_series",
  "host_first_night",
  "host_second_venue",
  "performer_signup_complete",
  "host_cta_click",
];

const marketing = read("src/lib/marketingTracking.ts");
for (const event of conversionEvents) {
  assert.match(marketing, new RegExp(`"${event}"`), `missing conversion event type: ${event}`);
}

assert.match(read("src/lib/conversionAttribution.ts"), /growth_outreach/);
assert.match(read("src/lib/conversionAttribution.ts"), /claim_invite/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /venue_registration_complete/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /host_registration_complete/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /performer_signup_complete/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /host_first_series/);
assert.match(read("src/components/publicListings/InstantClaimForm.tsx"), /venue_claim_complete/);
assert.match(read("src/app/open-mics/[listingSlug]/page.tsx"), /listing_claim_cta_click/);
assert.match(read("src/app/page.tsx"), /host_cta_click/);
assert.match(read("src/app/register/promoter/register-submit/route.ts"), /JOINED_HOST/);
assert.match(read("src/app/promoter/actions.ts"), /hostMilestoneQuery/);

assert.match(read("src/components/MicStageProductAnalytics.tsx"), /registration_completed_venue/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /registration_completed_host/);
assert.match(read("src/components/MicStageProductAnalytics.tsx"), /registration_completed_performer/);
assert.match(read("src/components/register/RegistrationFunnelTracker.tsx"), /registration_page_view/);
assert.match(read("src/components/register/RegistrationFunnelTracker.tsx"), /registration_form_started/);
assert.match(read("src/components/register/RegistrationFunnelTracker.tsx"), /registration_submitted/);
assert.match(read("src/components/register/RegistrationFunnelTracker.tsx"), /\/api\/growth\/registration-funnel/);
assert.match(read("src/components/register/RegistrationFunnelTracker.tsx"), /growthLeadId/);

const venueReg = read("src/app/register/venue/page.tsx");
assert.match(venueReg, /stampRegistrationPageViewed/);
assert.doesNotMatch(venueReg, /SIGNUP_STARTED/);
assert.match(venueReg, /growthLeadId=\{traceId/);

const hostReg = read("src/app/register/promoter/page.tsx");
assert.match(hostReg, /stampRegistrationPageViewed/);
assert.doesNotMatch(hostReg, /SIGNUP_STARTED/);
assert.match(hostReg, /growthLeadId=\{traceId/);

const performerReg = read("src/app/register/musician/page.tsx");
assert.match(performerReg, /stampRegistrationPageViewed/);
assert.doesNotMatch(performerReg, /SIGNUP_STARTED/);
assert.match(performerReg, /growthLeadId=\{traceId/);

const hostLanding = read("src/app/host/page.tsx");
assert.match(hostLanding, /CLICKED/);
assert.doesNotMatch(hostLanding, /SIGNUP_STARTED/);

assert.match(read("src/app/register/venue/register-submit/route.ts"), /stampRegistrationSubmitForLead/);
assert.match(read("src/app/register/promoter/register-submit/route.ts"), /stampRegistrationSubmitForLead/);
assert.match(read("src/app/register/musician/register-submit/route.ts"), /stampRegistrationSubmitForLead/);

for (const rel of [
  "src/app/register/venue/register-submit/route.ts",
  "src/app/register/promoter/register-submit/route.ts",
  "src/app/register/musician/register-submit/route.ts",
]) {
  const src = read(rel);
  const stampIdx = src.indexOf("stampRegistrationSubmitForLead");
  const consentIdx = src.indexOf("registrationContentConsentChecked");
  const rateIdx = src.indexOf("consumeRateLimit");
  assert.ok(stampIdx > 0 && stampIdx < consentIdx, `${rel}: stamp before consent`);
  assert.ok(stampIdx < rateIdx, `${rel}: stamp before rate limit`);
}

assert.match(read("src/lib/growth/growthLeadAcquisitionStage.ts"), /stampRegistrationPageViewed/);
assert.match(read("src/lib/growth/growthLeadAcquisitionStage.ts"), /stampRegistrationFormStarted/);
assert.match(read("src/lib/growth/growthLeadAcquisitionStage.ts"), /stampRegistrationSubmitted/);
assert.match(read("src/lib/growth/growthLeadAcquisitionStage.ts"), /registrationViewedAt/);
assert.match(read("src/lib/growth/growthLeadAcquisitionStage.ts"), /registrationSubmittedAt/);
assert.match(read("src/app/api/growth/registration-funnel/route.ts"), /form_started/);

assert.match(read("src/app/register/venue/page.tsx"), /Create your free venue account/);
assert.match(read("src/app/register/venue/register-submit/route.ts"), /\/venue\/setup/);
assert.match(read("src/app/venue/setup/page.tsx"), /Find your venue/);

assert.match(read("src/components/register/VenueSetupForm.tsx"), /claimListingSlug/);
assert.match(read("src/components/register/VenueSetupForm.tsx"), /name=\"claimListing\"/);
assert.match(read("src/components/register/VenueSetupForm.tsx"), /name=\"growthTraceLeadId\"/);
assert.match(read("src/app/register/venue/register-submit/route.ts"), /setupQs\.set\(\"growthLead\"/);
assert.match(read("src/app/register/venue/register-submit/route.ts"), /setupQs\.set\(\"claimListing\"/);
assert.match(read("src/app/claim/[listingSlug]/page.tsx"), /claimListing/);
assert.match(read("src/app/claim/[listingSlug]/page.tsx"), /growthLead/);
assert.match(read("src/components/RegistrationContentConsent.tsx"), /I agree to the/);
assert.match(read("src/components/RegistrationContentConsent.tsx"), /href=\"\/terms\"/);
assert.match(read("src/components/RegistrationContentConsent.tsx"), /href=\"\/privacy\"/);
assert.match(read("src/app/register/venue/page.tsx"), /Looks like you already have an account/);
assert.match(read("src/app/register/promoter/page.tsx"), /Looks like you already have an account/);
assert.match(read("src/app/register/musician/page.tsx"), /Looks like you already have an account/);
assert.match(read("src/app/register/venue/page.tsx"), /href=\"\/login\/venue\"/);
assert.match(read("src/app/register/promoter/page.tsx"), /href=\"\/login\/promoter\"/);
assert.match(read("src/app/register/musician/page.tsx"), /href=\"\/login\/musician\"/);

console.log(JSON.stringify({ ok: true, conversionEvents: conversionEvents.length }, null, 2));
