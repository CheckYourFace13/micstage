import { minutesToTimeLabel } from "@/lib/time";

export const MINUTES_PER_DAY = 1440;

/** Longest single open mic window we accept (a night that runs 24h+ is a data error). */
export const MAX_SCHEDULE_DURATION_MIN = MINUTES_PER_DAY;

/**
 * Minutes from the show day's local midnight for the end of a window.
 *
 * An end time at or before the start means the night runs past midnight (9:00 PM → 1:00 AM),
 * so it is stored as start-day minutes + 24h (1:00 AM = 1500). Every consumer already works in
 * "minutes from the instance date's local midnight" — `slotStartInstant` lands on the next
 * calendar day and `minutesToTimeLabel` wraps back to a 12h clock label.
 */
export function resolveScheduleEndMin(startTimeMin: number, endTimeMinRaw: number): number {
  return endTimeMinRaw <= startTimeMin ? endTimeMinRaw + MINUTES_PER_DAY : endTimeMinRaw;
}

/** True when the stored end time falls on the calendar day after the show date. */
export function scheduleEndsNextDay(endTimeMin: number): boolean {
  return endTimeMin >= MINUTES_PER_DAY;
}

export function isValidScheduleWindow(startTimeMin: number, endTimeMin: number): boolean {
  if (!Number.isInteger(startTimeMin) || !Number.isInteger(endTimeMin)) return false;
  if (startTimeMin < 0 || startTimeMin >= MINUTES_PER_DAY) return false;
  const duration = endTimeMin - startTimeMin;
  return duration > 0 && duration <= MAX_SCHEDULE_DURATION_MIN;
}

/** Reads start/end from a form (`HH:MM` 24h), normalizing a cross-midnight end. */
export function scheduleWindowFromTimeInputs(
  startInput: string | null | undefined,
  endInput: string | null | undefined,
): { startTimeMin: number; endTimeMin: number } | null {
  const start = parseTimeInput(startInput);
  const end = parseTimeInput(endInput);
  if (start == null || end == null) return null;
  const endTimeMin = resolveScheduleEndMin(start, end);
  if (!isValidScheduleWindow(start, endTimeMin)) return null;
  return { startTimeMin: start, endTimeMin };
}

function parseTimeInput(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** `9:00 PM – 1:00 AM (next day)` — one label for dashboards and public pages. */
export function scheduleWindowLabel(
  startTimeMin: number,
  endTimeMin: number,
  opts?: { nextDaySuffix?: string },
): string {
  const range = `${minutesToTimeLabel(startTimeMin)} – ${minutesToTimeLabel(endTimeMin)}`;
  if (!scheduleEndsNextDay(endTimeMin)) return range;
  return `${range} ${opts?.nextDaySuffix ?? "(next day)"}`;
}
