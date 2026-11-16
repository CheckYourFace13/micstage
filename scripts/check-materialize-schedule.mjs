/**
 * Pure checks for recurring-schedule → upcoming-night materialization (no DB).
 *   npx tsx scripts/check-materialize-schedule.mjs
 */
import assert from "node:assert/strict";
import { listMaterializationCandidateDates } from "../src/lib/venue/materializeVenueScheduleInstances.ts";

const TZ = "America/Chicago";
// Fixed "now": Wednesday 2026-09-09 afternoon CT
const NOW = new Date("2026-09-09T19:00:00.000Z");
const SERIES_START = new Date("2026-09-09T00:00:00.000Z");
const SERIES_END = new Date("2026-10-09T00:00:00.000Z"); // 30 days ahead

const friDates = listMaterializationCandidateDates({
  seriesStart: SERIES_START,
  seriesEnd: SERIES_END,
  timeZone: TZ,
  weekday: "FRI",
  bookingOpensDaysAhead: 30,
  now: NOW,
});

assert.ok(friDates.length >= 4, `expected several Fridays in a 30-day window, got ${friDates.length}`);
for (const d of friDates) {
  const ymd = d.toISOString().slice(0, 10);
  // 2026-09-11, 09-18, 09-25, 10-02, 10-09 are Fridays
  assert.match(ymd, /^2026-09-(11|18|25)$|^2026-10-(02|09)$/, `unexpected Friday candidate ${ymd}`);
}

const wedDates = listMaterializationCandidateDates({
  seriesStart: SERIES_START,
  seriesEnd: SERIES_END,
  timeZone: TZ,
  weekday: "WED",
  bookingOpensDaysAhead: 14,
  now: NOW,
});
// booking window 14 days: Wed 9/9 through Wed 9/23 inclusive for WED
assert.deepEqual(
  wedDates.map((d) => d.toISOString().slice(0, 10)),
  ["2026-09-09", "2026-09-16", "2026-09-23"],
  "Wednesday candidates must follow the real weekday + booking window only",
);

const empty = listMaterializationCandidateDates({
  seriesStart: SERIES_START,
  seriesEnd: SERIES_END,
  timeZone: TZ,
  weekday: "SUN",
  bookingOpensDaysAhead: 2,
  now: NOW,
});
assert.equal(empty.length, 0, "no Sundays inside a 2-day window starting Wednesday");

console.log("check-materialize-schedule: OK");
