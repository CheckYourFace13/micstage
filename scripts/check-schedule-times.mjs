/**
 * Start/end time editing regression checks, including nights that run past midnight (no network).
 *   npx tsx scripts/check-schedule-times.mjs
 */
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  isValidScheduleWindow,
  resolveScheduleEndMin,
  scheduleEndsNextDay,
  scheduleWindowFromTimeInputs,
  scheduleWindowLabel,
} from "../src/lib/scheduleWindow.ts";
import { generateSlotsForWindow } from "../src/lib/slotGeneration.ts";
import { slotStartInstant } from "../src/lib/venueBookingRules.ts";
import { computeWeeklySchedulePreview } from "../src/lib/weeklySchedule.ts";

const TZ = "America/Chicago";
const FRIDAY = new Date("2026-09-11T00:00:00.000Z");

/** Wall-clock rendering of a slot in the venue's zone: `2026-09-12 01:00`. */
function localWallClock(instanceDate, startMin) {
  return DateTime.fromJSDate(slotStartInstant(instanceDate, startMin, TZ))
    .setZone(TZ)
    .toFormat("yyyy-MM-dd HH:mm");
}

const scenarios = [
  { name: "7 PM -> 10 PM", start: "19:00", end: "22:00", endMin: 22 * 60, nextDay: false, label: "7:00 PM – 10:00 PM" },
  { name: "9 PM -> 1 AM", start: "21:00", end: "01:00", endMin: 25 * 60, nextDay: true, label: "9:00 PM – 1:00 AM (next day)" },
  { name: "11 PM -> 2 AM", start: "23:00", end: "02:00", endMin: 26 * 60, nextDay: true, label: "11:00 PM – 2:00 AM (next day)" },
  { name: "daytime 11 AM -> 2 PM", start: "11:00", end: "14:00", endMin: 14 * 60, nextDay: false, label: "11:00 AM – 2:00 PM" },
];

for (const s of scenarios) {
  const window = scheduleWindowFromTimeInputs(s.start, s.end);
  assert.ok(window, `${s.name}: must be accepted, not rejected as invalid`);
  assert.equal(window.endTimeMin, s.endMin, `${s.name}: normalized end minutes`);
  assert.equal(scheduleEndsNextDay(window.endTimeMin), s.nextDay, `${s.name}: next-day flag`);
  assert.equal(scheduleWindowLabel(window.startTimeMin, window.endTimeMin), s.label, `${s.name}: public label`);
  assert.ok(isValidScheduleWindow(window.startTimeMin, window.endTimeMin), `${s.name}: window validity`);

  const slots = generateSlotsForWindow({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    slotMinutes: 25,
    breakMinutes: 5,
  });
  assert.ok(slots.length > 0, `${s.name}: generates bookable slots`);
  const last = slots[slots.length - 1];
  assert.ok(last.endMin <= window.endTimeMin, `${s.name}: last slot stays inside the window`);

  const preview = computeWeeklySchedulePreview({
    seriesStart: FRIDAY,
    seriesEnd: FRIDAY,
    weekdays: ["FRI"],
    timeZone: TZ,
    startTimeMin: window.startTimeMin,
    // Raw (un-normalized) end, as the venue form sends it.
    endTimeMin: window.endTimeMin >= 1440 ? window.endTimeMin - 1440 : window.endTimeMin,
    slotMinutes: 25,
    breakMinutes: 5,
  });
  assert.ok(preview, `${s.name}: schedule preview is computable`);
  assert.equal(preview.slotsPerShow, slots.length, `${s.name}: preview matches generated slot count`);
}

// The venue owner's real schedule: Friday 9:00 PM – 1:00 AM lands on Saturday morning locally.
const fri9pmTo1am = scheduleWindowFromTimeInputs("21:00", "01:00");
assert.equal(localWallClock(FRIDAY, fri9pmTo1am.startTimeMin), "2026-09-11 21:00");
assert.equal(localWallClock(FRIDAY, fri9pmTo1am.endTimeMin), "2026-09-12 01:00");

const lateSlots = generateSlotsForWindow({
  startTimeMin: fri9pmTo1am.startTimeMin,
  endTimeMin: fri9pmTo1am.endTimeMin,
  slotMinutes: 30,
  breakMinutes: 0,
});
assert.equal(lateSlots.length, 8, "9 PM – 1 AM at 30 min per slot = 8 slots");
assert.equal(localWallClock(FRIDAY, lateSlots[lateSlots.length - 1].startMin), "2026-09-12 00:30");

// Same-time start/end means a full 24h day, not a zero-length or rejected window.
assert.equal(resolveScheduleEndMin(21 * 60, 21 * 60), 21 * 60 + 1440);
assert.ok(isValidScheduleWindow(21 * 60, 21 * 60 + 1440));

// Guard rails still hold.
assert.equal(scheduleWindowFromTimeInputs("21:00", "99:99"), null, "garbage times are rejected");
assert.equal(scheduleWindowFromTimeInputs("", "01:00"), null, "missing start is rejected");
assert.equal(isValidScheduleWindow(21 * 60, 21 * 60 + 1441), false, "over 24h is rejected");

console.log("check-schedule-times: OK");
