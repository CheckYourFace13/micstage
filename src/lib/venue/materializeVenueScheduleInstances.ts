/**
 * Create EventInstance + slots for venue-owned EventTemplates inside the booking window.
 * Dates come only from the template weekday + venue series / booking-window bounds — never invented.
 */
import type { PrismaClient, Weekday } from "@/generated/prisma/client";
import { generateSlotsForWindow } from "@/lib/slotGeneration";
import { syncSlotsForInstance } from "@/lib/slotSync";
import {
  addDaysToYmd,
  venueTodayYmdFromIanaZone,
} from "@/lib/venueBookingWindowYmd";
import { isDateInSeriesRange, isWithinBookingWindow } from "@/lib/venueBookingRules";
import { iterStorageDatesInVenueSeries } from "@/lib/weeklySchedule";

export type MaterializeTemplate = {
  id: string;
  weekday: Weekday;
  startTimeMin: number;
  endTimeMin: number;
  slotMinutes: number;
  breakMinutes: number;
};

export type MaterializeVenueWindow = {
  seriesStartDate: Date | null;
  seriesEndDate: Date | null;
  bookingOpensDaysAhead: number;
  timeZone: string;
};

function storageDateFromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Storage dates that match `weekday` and pass series + booking-window gates. */
export function listMaterializationCandidateDates(input: {
  seriesStart: Date;
  seriesEnd: Date;
  timeZone: string;
  weekday: Weekday;
  bookingOpensDaysAhead: number;
  now?: Date;
}): Date[] {
  const now = input.now ?? new Date();
  const venueForRules: MaterializeVenueWindow = {
    seriesStartDate: input.seriesStart,
    seriesEndDate: input.seriesEnd,
    bookingOpensDaysAhead: input.bookingOpensDaysAhead,
    timeZone: input.timeZone,
  };
  const out: Date[] = [];
  for (const { storageDate, weekday } of iterStorageDatesInVenueSeries(
    input.seriesStart,
    input.seriesEnd,
    input.timeZone,
  )) {
    if (weekday !== input.weekday) continue;
    if (!isDateInSeriesRange(venueForRules, storageDate)) continue;
    if (!isWithinBookingWindow(venueForRules, storageDate, now)) continue;
    out.push(storageDate);
  }
  return out;
}

/**
 * Upsert instances + sync slots for each template on matching weekdays in `dateRange`
 * (defaults to the venue series bounds), gated by series + booking window.
 */
export async function materializeVenueScheduleInstances(
  prisma: PrismaClient,
  opts: {
    templates: MaterializeTemplate[];
    venue: MaterializeVenueWindow;
    /** Inclusive iteration range; defaults to venue seriesStart/seriesEnd when both set. */
    dateRange?: { start: Date; end: Date };
    now?: Date;
  },
): Promise<{ generatedInstanceCount: number }> {
  const now = opts.now ?? new Date();
  const tz = opts.venue.timeZone?.trim() || "America/Chicago";
  const rangeStart = opts.dateRange?.start ?? opts.venue.seriesStartDate;
  const rangeEnd = opts.dateRange?.end ?? opts.venue.seriesEndDate;
  if (!rangeStart || !rangeEnd) return { generatedInstanceCount: 0 };
  if (rangeEnd.getTime() < rangeStart.getTime()) return { generatedInstanceCount: 0 };

  const venueForRules: MaterializeVenueWindow = {
    seriesStartDate: opts.venue.seriesStartDate ?? rangeStart,
    seriesEndDate: opts.venue.seriesEndDate ?? rangeEnd,
    bookingOpensDaysAhead: opts.venue.bookingOpensDaysAhead,
    timeZone: tz,
  };

  let generatedInstanceCount = 0;
  for (const template of opts.templates) {
    const specs = generateSlotsForWindow({
      startTimeMin: template.startTimeMin,
      endTimeMin: template.endTimeMin,
      slotMinutes: template.slotMinutes,
      breakMinutes: template.breakMinutes,
    });
    if (specs.length === 0) continue;

    for (const { storageDate, weekday } of iterStorageDatesInVenueSeries(rangeStart, rangeEnd, tz)) {
      if (weekday !== template.weekday) continue;
      if (!isDateInSeriesRange(venueForRules, storageDate)) continue;
      if (!isWithinBookingWindow(venueForRules, storageDate, now)) continue;

      await prisma.$transaction(async (tx) => {
        const inst =
          (await tx.eventInstance.findUnique({
            where: { templateId_date: { templateId: template.id, date: storageDate } },
          })) ??
          (await tx.eventInstance.create({
            data: { templateId: template.id, date: storageDate },
          }));
        if (inst.isCancelled) return;
        await syncSlotsForInstance(tx, inst.id, specs);
        generatedInstanceCount += 1;
      });
    }
  }

  return { generatedInstanceCount };
}

/**
 * Ensure venue-owned public templates have instances in the live booking window.
 * Fills a missing series window (common after claim publish). Optionally extends an
 * expired end when the caller explicitly opts in (activation / schedule save).
 * Skips host-owned templates (`promoterNightId`).
 */
export async function ensureVenueScheduleMaterialized(
  prisma: PrismaClient,
  venueId: string,
  opts?: { now?: Date; extendExpiredEnd?: boolean },
): Promise<{ generatedInstanceCount: number; windowUpdated: boolean }> {
  const now = opts?.now ?? new Date();
  const extendExpiredEnd = opts?.extendExpiredEnd === true;
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      timeZone: true,
      seriesStartDate: true,
      seriesEndDate: true,
      bookingOpensDaysAhead: true,
      eventTemplates: {
        where: { isPublic: true, promoterNightId: null },
        select: {
          id: true,
          weekday: true,
          startTimeMin: true,
          endTimeMin: true,
          slotMinutes: true,
          breakMinutes: true,
        },
      },
    },
  });
  if (!venue || venue.eventTemplates.length === 0) {
    return { generatedInstanceCount: 0, windowUpdated: false };
  }

  const tz = venue.timeZone?.trim() || "America/Chicago";
  const bookingOpensDaysAhead = Math.max(1, venue.bookingOpensDaysAhead || 60);
  const todayYmd = venueTodayYmdFromIanaZone(tz, now);
  const horizonYmd = addDaysToYmd(todayYmd, bookingOpensDaysAhead);
  const todayDate = storageDateFromYmd(todayYmd);
  const horizonDate = storageDateFromYmd(horizonYmd);

  let seriesStart = venue.seriesStartDate;
  let seriesEnd = venue.seriesEndDate;
  let windowUpdated = false;

  // Missing series (common after claim publish): open the booking window from today.
  if (!seriesStart || !seriesEnd) {
    seriesStart = todayDate;
    seriesEnd = horizonDate;
    windowUpdated = true;
  } else if (extendExpiredEnd && seriesEnd.toISOString().slice(0, 10) < horizonYmd) {
    seriesEnd = horizonDate;
    windowUpdated = true;
  }

  if (windowUpdated && seriesStart && seriesEnd) {
    await prisma.venue.update({
      where: { id: venueId },
      data: {
        seriesStartDate: seriesStart,
        seriesEndDate: seriesEnd,
        bookingOpensDaysAhead,
      },
    });
  }

  // Walk from today (or series start if later) so past calendar days are not re-scanned.
  const startYmd = seriesStart!.toISOString().slice(0, 10);
  const iterStart = startYmd < todayYmd ? todayDate : seriesStart!;

  const { generatedInstanceCount } = await materializeVenueScheduleInstances(prisma, {
    templates: venue.eventTemplates,
    venue: {
      seriesStartDate: seriesStart,
      seriesEndDate: seriesEnd,
      bookingOpensDaysAhead,
      timeZone: tz,
    },
    dateRange: { start: iterStart, end: seriesEnd! },
    now,
  });

  return { generatedInstanceCount, windowUpdated };
}
