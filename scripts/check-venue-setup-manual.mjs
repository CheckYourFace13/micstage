/**
 * Venue setup: manual place ids + address compose + Places picker must not use legacy Autocomplete.
 *   node scripts/check-venue-setup-manual.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  composeManualVenueAddress,
  isManualVenuePlaceId,
  makeManualVenuePlaceId,
  MANUAL_VENUE_PLACE_ID_PREFIX,
} from "../src/lib/venues/manualVenuePlaceId.ts";

{
  const id = makeManualVenuePlaceId("abc123");
  assert.equal(id, `${MANUAL_VENUE_PLACE_ID_PREFIX}abc123`);
  assert.equal(isManualVenuePlaceId(id), true);
  assert.equal(isManualVenuePlaceId("ChIJabc"), false);
  assert.equal(isManualVenuePlaceId(null), false);
}

{
  const us = composeManualVenueAddress({
    street: "3203 W Irving Park Rd",
    city: "Chicago",
    region: "IL",
    postal: "60618",
    country: "United States",
  });
  assert.equal(us, "3203 W Irving Park Rd, Chicago, IL, 60618, United States");
}

{
  const intl = composeManualVenueAddress({
    street: "12 King Street West",
    city: "Toronto",
    region: "ON",
    postal: "M5H 3T9",
    country: "Canada",
  });
  assert.match(intl, /Toronto/);
  assert.match(intl, /Canada/);
  assert.doesNotMatch(intl, /United States/);
}

{
  const uk = composeManualVenueAddress({
    street: "1 High Street",
    city: "London",
    region: "",
    postal: "SW1A 1AA",
    country: "United Kingdom",
  });
  assert.equal(uk, "1 High Street, London, SW1A 1AA, United Kingdom");
}

const picker = readFileSync("src/app/register/venue/VenuePlacePicker.tsx", "utf8");
assert.doesNotMatch(picker, /places\.Autocomplete\(/);
assert.match(picker, /PlaceAutocompleteElement/);
assert.match(picker, /gmp-error/);
assert.match(picker, /gm_authFailure/);
assert.match(picker, /Venue search is unavailable right now\. Enter your venue manually\./);
assert.doesNotMatch(picker, /Oops! Something went wrong/);
assert.doesNotMatch(picker, /GOOGLE_MAPS_SERVER_API_KEY/);
assert.doesNotMatch(picker, /googleMapsServerApiKey/);

const form = readFileSync("src/components/register/VenueSetupForm.tsx", "utf8");
assert.match(form, /entryMode/);
assert.match(form, /Enter your venue manually/);
assert.match(form, /name=\"street\"/);
assert.match(form, /name=\"postal\"/);
assert.match(form, /name=\"country\"/);
assert.match(form, /not marked Google-verified/);

const submit = readFileSync("src/app/venue/setup/setup-submit/route.ts", "utf8");
assert.match(submit, /entryMode === \"manual\"/);
assert.match(submit, /makeManualVenuePlaceId/);
assert.match(submit, /isManualVenuePlaceId/);
assert.doesNotMatch(submit, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);

const gateway = readFileSync("src/lib/places/placesGateway.ts", "utf8");
assert.match(gateway, /places\.googleapis\.com/);
// Comment may mention the forbidden legacy path; ensure we never call it.
assert.doesNotMatch(gateway, /fetch\([^)]*maps\.googleapis\.com\/maps\/api\/place/);
assert.doesNotMatch(gateway, /https:\/\/maps\.googleapis\.com\/maps\/api\/place/);

console.log("venue-setup-manual checks passed");
