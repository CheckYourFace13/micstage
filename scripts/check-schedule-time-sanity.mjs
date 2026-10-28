/**
 * Schedule time sanity + parser regression fixtures.
 *   npx tsx scripts/check-schedule-time-sanity.mjs
 */
import assert from "node:assert/strict";
import {
  evaluateScheduleTimeSanity,
  markTimeUnconfirmedDescription,
  scheduleDescriptionIsTimeUnconfirmed,
  scheduleTimesArePubliclyConfirmed,
} from "../src/lib/publicListings/scheduleTimeSanity.ts";
import {
  parseExplicitScheduleFromHtml,
  parseExplicitScheduleFromIcs,
  parseExplicitScheduleFromText,
} from "../src/lib/publicListings/explicitScheduleParse.ts";
import { explicitScheduleEndTimeMin } from "../src/lib/publicListings/listingScheduleEnrichment.ts";
import { performanceFormatLabel, humanizeEnumLabel } from "../src/lib/venueDisplay.ts";
import { isPublicListingNameOk, listingIsPubliclyIndexable } from "../src/lib/publicListings/listingQuality.ts";

function clock(h, m = 0) {
  return h * 60 + m;
}

// 12 AM
assert.equal(parseExplicitScheduleFromText("every Wednesday at 12:00 AM")?.startTimeMin, 0);
assert.equal(parseExplicitScheduleFromText("Wednesday 12:00 AM")?.startTimeMin, 0);
assert.equal(evaluateScheduleTimeSanity({ startTimeMin: 0, endTimeMin: 60, timeZone: "America/Chicago" }).ok, true);

// 12 PM
assert.equal(parseExplicitScheduleFromText("every Wednesday at 12:00 PM")?.startTimeMin, 12 * 60);
assert.equal(parseExplicitScheduleFromText("Wednesday 12:00 PM")?.startTimeMin, 12 * 60);
assert.equal(evaluateScheduleTimeSanity({ startTimeMin: 12 * 60, endTimeMin: 14 * 60, timeZone: "America/New_York" }).ok, true);

// 2 AM — hide, do not invent a replacement
{
  const v = evaluateScheduleTimeSanity({ startTimeMin: clock(2), endTimeMin: clock(4), timeZone: "America/Los_Angeles" });
  assert.equal(v.ok, false);
  assert.ok(v.reasons.includes("morning_start_unconfirmed"));
}

// 8 PM
assert.equal(parseExplicitScheduleFromText("every Wednesday at 8:00 PM")?.startTimeMin, 20 * 60);
assert.equal(evaluateScheduleTimeSanity({ startTimeMin: clock(20), endTimeMin: clock(22), timeZone: "America/Chicago" }).ok, true);

// overnight event 9 PM – 1 AM
{
  const parsed = parseExplicitScheduleFromText("Open mic Wednesday 9:00 PM – 1:00 AM");
  assert.ok(parsed);
  assert.equal(parsed.startTimeMin, clock(21));
  const end = explicitScheduleEndTimeMin(parsed);
  assert.ok(end != null && end > parsed.startTimeMin);
  const v = evaluateScheduleTimeSanity({
    startTimeMin: parsed.startTimeMin,
    endTimeMin: end,
    timeZone: "America/Chicago",
    rawText: parsed.raw,
  });
  assert.equal(v.ok, true, JSON.stringify(v.reasons));
}

// missing end
{
  const parsed = parseExplicitScheduleFromText("every Thursday at 8:00 PM");
  assert.ok(parsed);
  assert.equal(parsed.endTimeMin, null);
  const v = evaluateScheduleTimeSanity({
    startTimeMin: parsed.startTimeMin,
    endTimeMin: null,
    timeZone: "America/Chicago",
    rawText: parsed.raw,
  });
  assert.equal(v.ok, true);
}

// >8-hour suspicious range (venue hours, not an open mic)
{
  const v = evaluateScheduleTimeSanity({
    startTimeMin: clock(11),
    endTimeMin: clock(23),
    timeZone: "America/Chicago",
    rawText: "Thursday 11:00 AM – 11:00 PM",
  });
  assert.equal(v.ok, false);
  assert.ok(v.reasons.includes("duration_over_8h"));
}

// timezone conversion: wall clock stays; invalid zone without geo is unconfirmed
{
  const v = evaluateScheduleTimeSanity({
    startTimeMin: clock(20),
    endTimeMin: clock(22),
    timeZone: "NotAZone",
  });
  assert.equal(v.ok, false);
  assert.ok(v.reasons.includes("timezone_unconfirmed"));
  const geoOk = evaluateScheduleTimeSanity({
    startTimeMin: clock(20),
    endTimeMin: clock(22),
    timeZone: "NotAZone",
    listingLat: 41.88,
    listingLng: -87.63,
  });
  assert.equal(geoOk.ok, true);
}

// JSON-LD ISO offset must keep venue wall clock (not UTC host hours)
{
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    name: "Weekly Open Mic",
    eventSchedule: { "@type": "Schedule", byDay: "Thursday", startTime: "2026-02-19T20:00:00-06:00" },
  })}</script>`;
  const hit = parseExplicitScheduleFromHtml(html);
  assert.equal(hit?.startTimeMin, 20 * 60);
  assert.equal(hit?.weekday, "THU");
}

// JSON-LD / ICS / table extraction still go through sanity
{
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    name: "Open Mic",
    startDate: "2026-11-05T02:30:00",
  })}</script>`;
  const fromLd = parseExplicitScheduleFromHtml(html);
  if (fromLd) {
    const v = evaluateScheduleTimeSanity({
      startTimeMin: fromLd.startTimeMin,
      endTimeMin: fromLd.endTimeMin,
      timeZone: "America/Chicago",
      rawText: fromLd.raw,
    });
    assert.equal(v.ok, false);
  }
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Open Mic", "DTSTART:20261106T020000", "END:VEVENT", "END:VCALENDAR"].join("\n");
  const fromIcs = parseExplicitScheduleFromIcs(ics);
  if (fromIcs) {
    const v = evaluateScheduleTimeSanity({
      startTimeMin: fromIcs.startTimeMin,
      endTimeMin: fromIcs.endTimeMin,
      timeZone: "America/Chicago",
      rawText: fromIcs.raw,
    });
    assert.equal(v.ok, false);
  }
}

{
  const d = markTimeUnconfirmedDescription("Confirmed from official source: 2am", ["morning_start_unconfirmed"]);
  assert.equal(scheduleDescriptionIsTimeUnconfirmed(d), true);
  assert.equal(scheduleTimesArePubliclyConfirmed({ isActive: true, description: d }), false);
  assert.equal(scheduleTimesArePubliclyConfirmed({ isActive: true, description: "Confirmed from official source: 8pm" }), true);
}

{
  const isoSkew = evaluateScheduleTimeSanity({
    startTimeMin: 0,
    endTimeMin: 3 * 60,
    timeZone: "America/Los_Angeles",
    rawText: "Confirmed from official source: 2026-10-11T17:00:00-07:00",
  });
  assert.equal(isoSkew.ok, false);
  assert.ok(isoSkew.reasons.includes("source_text_conflict"));
}

assert.equal(performanceFormatLabel("OPEN_VARIETY"), "Open variety");
assert.equal(performanceFormatLabel("ACOUSTIC_ONLY"), "Acoustic");
assert.equal(performanceFormatLabel("FULL_BANDS_ALLOWED"), "Full bands");
assert.equal(performanceFormatLabel("COMEDY_SPOKEN_WORD"), "Comedy / spoken word");
assert.equal(performanceFormatLabel("SOME_NEW_FORMAT"), humanizeEnumLabel("SOME_NEW_FORMAT"));
assert.doesNotMatch(performanceFormatLabel("SOME_NEW_FORMAT"), /_/);

assert.equal(isPublicListingNameOk("Check"), false);
assert.equal(isPublicListingNameOk("Coffee Shop"), false);
assert.equal(isPublicListingNameOk("Cafe Wha?"), true);

assert.equal(
  listingIsPubliclyIndexable({
    name: "Blue Note Open Mic",
    verificationStatus: "VERIFIED",
    formattedAddress: "123 Main St, Chicago, IL",
    city: "Chicago",
    schedules: [{ description: "TIME_UNCONFIRMED:duration_over_8h venue hours" }],
    lastVerifiedAt: new Date(),
  }),
  false,
);

console.log("schedule time sanity fixtures passed");
