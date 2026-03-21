import { DateTime } from "luxon";
import type { Weekday } from "@/generated/prisma/client";
import { generateSlotsForWindow } from "@/lib/slotGeneration";

const LUXON_TO_WEEKDAY: Record<number, Weekday> = {
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
  7: "SUN",
};

export const ALL_WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function parseWeekdaysFromForm(formData: FormData, fieldName = "weekdays"): Weekday[] {
  const raw = formData.getAll(fieldName);
  const out: Weekday[] = [];
  const seen = new Set<Weekday>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim() as Weekday;
    if (!ALL_WEEKDAYS.includes(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export type WeeklySchedulePreviewInput = {
  seriesStart: Date;
  seriesEnd: Date;
  weekdays: Weekday[];
  timeZone: string;
  startTimeMin: number;
  endTimeMin: number;
  slotMinutes: number;
  breakMinutes: number;
};

export type WeeklySchedulePreview = {
  showNights: number;
  slotsPerShow: number;
  totalNewSlots: number;
};

/**
 * Counts how many venue-calendar evenings match selected weekdays between series bounds,
 * and total slot rows that would exist if each night used the same grid (no DB reads).
 *
 * Date iteration uses Luxon calendar steps in the venue zone (`plus({ days: 1 })` from local
 * `startOf("day")`), which follows civil dates through DST (no 25h/23h UTC bugs for “which
 * day is it?”). Instance `storageDate` is always `YYYY-MM-DDT00:00:00.000Z` for that civil
 * label — same invariant as the rest of the app (`slotStartInstant` interprets show times).
 */
export function computeWeeklySchedulePreview(input: WeeklySchedulePreviewInput): WeeklySchedulePreview | null {
  const { seriesStart, seriesEnd, weekdays, timeZone, startTimeMin, endTimeMin, slotMinutes, breakMinutes } = input;
  if (weekdays.length === 0) return null;
  if (seriesEnd.getTime() < seriesStart.getTime()) return null;
  if (endTimeMin <= startTimeMin) return null;
  if (slotMinutes <= 0 || breakMinutes < 0) return null;

  const tz = timeZone?.trim() || "America/Chicago";
  const startYmd = seriesStart.toISOString().slice(0, 10);
  const endYmd = seriesEnd.toISOString().slice(0, 10);

  let cur = DateTime.fromObject(
    {
      year: Number.parseInt(startYmd.slice(0, 4), 10),
      month: Number.parseInt(startYmd.slice(5, 7), 10),
      day: Number.parseInt(startYmd.slice(8, 10), 10),
    },
    { zone: tz },
  ).startOf("day");

  const end = DateTime.fromObject(
    {
      year: Number.parseInt(endYmd.slice(0, 4), 10),
      month: Number.parseInt(endYmd.slice(5, 7), 10),
      day: Number.parseInt(endYmd.slice(8, 10), 10),
    },
    { zone: tz },
  ).startOf("day");

  if (!cur.isValid || !end.isValid) return null;

  const weekdaySet = new Set(weekdays);
  let showNights = 0;
  while (cur <= end) {
    const w = LUXON_TO_WEEKDAY[cur.weekday];
    if (w && weekdaySet.has(w)) showNights++;
    cur = cur.plus({ days: 1 });
  }

  const slotsPerShow = generateSlotsForWindow({
    startTimeMin,
    endTimeMin,
    slotMinutes,
    breakMinutes,
  }).length;

  return {
    showNights,
    slotsPerShow,
    totalNewSlots: showNights * slotsPerShow,
  };
}

/**
 * Every calendar day in the series range as stored instance dates (`YYYY-MM-DDT00:00:00.000Z`).
 * Walks the venue’s local calendar; DST transitions shift wall-clock but not the sequence of
 * civil dates (fall-back “repeat hour” is not modeled — open-mic ranges rarely start at 1:00 local).
 */
export function* iterStorageDatesInVenueSeries(seriesStart: Date, seriesEnd: Date, timeZone: string): Generator<{
  storageDate: Date;
  weekday: Weekday;
}> {
  const tz = timeZone?.trim() || "America/Chicago";
  const startYmd = seriesStart.toISOString().slice(0, 10);
  const endYmd = seriesEnd.toISOString().slice(0, 10);

  let cur = DateTime.fromObject(
    {
      year: Number.parseInt(startYmd.slice(0, 4), 10),
      month: Number.parseInt(startYmd.slice(5, 7), 10),
      day: Number.parseInt(startYmd.slice(8, 10), 10),
    },
    { zone: tz },
  ).startOf("day");

  const end = DateTime.fromObject(
    {
      year: Number.parseInt(endYmd.slice(0, 4), 10),
      month: Number.parseInt(endYmd.slice(5, 7), 10),
      day: Number.parseInt(endYmd.slice(8, 10), 10),
    },
    { zone: tz },
  ).startOf("day");

  if (!cur.isValid || !end.isValid) return;

  while (cur <= end) {
    const w = LUXON_TO_WEEKDAY[cur.weekday];
    if (w) {
      const iso = cur.toFormat("yyyy-MM-dd");
      yield { storageDate: new Date(`${iso}T00:00:00.000Z`), weekday: w };
    }
    cur = cur.plus({ days: 1 });
  }
}
