/**
 * Event JSON-LD regression: dated venue nights emit Event; undated listings do not.
 * Run: npx tsx scripts/check-event-jsonld.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildListingEventJsonLd,
  buildVenueNightEventJsonLd,
  isValidEventStartDate,
} from "../src/lib/publicListings/listingSeo.ts";
import { instanceWindowForSchedule, storageYmdUtc } from "../src/lib/venuePublicLineup.ts";
import { slotStartInstant } from "../src/lib/venueBookingRules.ts";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// --- Negative: recurring weekday-only / empty occurrences → no Event
assert.equal(
  buildListingEventJsonLd({
    listingName: "Blue Note Open Mic",
    formattedAddress: "123 Main",
    url: "https://micstage.com/open-mics/blue-note",
    occurrences: [],
  }).length,
  0,
);

assert.equal(
  buildListingEventJsonLd({
    listingName: "Schedule not published room",
    url: "https://micstage.com/open-mics/thin",
    occurrences: null,
  }).length,
  0,
);

// Listing page must keep hardcoded empty occurrences (no invented dates).
const listingPage = read("src/app/open-mics/[listingSlug]/page.tsx");
assert.match(listingPage, /occurrences:\s*\[\s*\]/);
assert.match(listingPage, /never synthesize Event startDate/);

// Generic venue page stays LocalBusiness, not Event.
const venuePage = read("src/app/venues/[venueSlug]/page.tsx");
assert.match(venuePage, /LocalBusiness/);
assert.doesNotMatch(venuePage, /buildVenueNightEventJsonLd/);

// --- Positive: concrete dated venue night
const instanceDate = new Date("2026-10-14T00:00:00.000Z");
const tz = "America/Chicago";
const startMin = 1080; // 18:00
const endMin = 1260; // 21:00
const start = slotStartInstant(instanceDate, startMin, tz);
const end = slotStartInstant(instanceDate, endMin, tz);
assert.equal(storageYmdUtc(instanceDate), "2026-10-14");

const events = buildVenueNightEventJsonLd({
  venueName: "Jokers Comedy House",
  formattedAddress: "123 Laugh Ln, Chicago, IL",
  url: "https://micstage.com/venues/open-mic-night-at-jokers-comedy-house/lineup/2026-10-14",
  nights: [
    {
      eventName: "Open mic",
      start,
      end,
      isCancelled: false,
    },
  ],
});

assert.equal(events.length, 1);
assert.equal(events[0]["@type"], "Event");
assert.equal(events[0].name, "Open mic");
assert.equal(events[0].startDate, start.toISOString());
assert.equal(events[0].endDate, end.toISOString());
assert.equal(events[0].eventStatus, "https://schema.org/EventScheduled");
assert.equal(events[0].eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
assert.equal(events[0].location["@type"], "Place");
assert.equal(events[0].location.name, "Jokers Comedy House");
assert.equal(events[0].location.address, "123 Laugh Ln, Chicago, IL");
assert.equal(
  events[0].url,
  "https://micstage.com/venues/open-mic-night-at-jokers-comedy-house/lineup/2026-10-14",
);
assert.equal("offers" in events[0], false);
assert.equal("organizer" in events[0], false);
assert.ok(isValidEventStartDate(String(events[0].startDate)));

// Cancelled night → no Event
assert.equal(
  buildVenueNightEventJsonLd({
    venueName: "Jokers Comedy House",
    url: "https://micstage.com/venues/x/lineup/2026-10-14",
    nights: [{ eventName: "Open mic", start, end, isCancelled: true }],
  }).length,
  0,
);

// Empty nights / invalid start → no Event
assert.equal(
  buildVenueNightEventJsonLd({
    venueName: "Jokers Comedy House",
    url: "https://micstage.com/venues/x/lineup/2026-10-14",
    nights: [],
  }).length,
  0,
);
assert.equal(
  buildVenueNightEventJsonLd({
    venueName: "Jokers Comedy House",
    url: "https://micstage.com/venues/x/lineup/2026-10-14",
    nights: [{ eventName: "Open mic", start: new Date("invalid"), end }],
  }).length,
  0,
);

// Window helper uses stored override minutes when present
const window = instanceWindowForSchedule(
  { timeZone: tz, startTimeMin: 1080, endTimeMin: 1260 },
  {
    date: instanceDate,
    slots: [],
    startTimeMinOverride: 1140,
    endTimeMinOverride: 1320,
  },
);
assert.equal(window.start.toISOString(), slotStartInstant(instanceDate, 1140, tz).toISOString());
assert.equal(window.end.toISOString(), slotStartInstant(instanceDate, 1320, tz).toISOString());

// Dated lineup page wires the helper
const lineupDatePage = read("src/app/venues/[venueSlug]/lineup/[date]/page.tsx");
assert.match(lineupDatePage, /buildVenueNightEventJsonLd/);
assert.match(lineupDatePage, /application\/ld\+json/);
assert.match(lineupDatePage, /instanceWindowForSchedule/);
assert.match(lineupDatePage, /lineups\.length > 0/);

console.log("ok: event json-ld (dated venue nights only)");
