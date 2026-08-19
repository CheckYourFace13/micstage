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

console.log(JSON.stringify({ ok: true, conversionEvents: conversionEvents.length }, null, 2));
