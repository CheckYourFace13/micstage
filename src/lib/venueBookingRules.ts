import { DateTime } from "luxon";
import { BookingRestrictionMode } from "@/generated/prisma/client";

/** YYYY-MM-DD for dates stored as UTC midnight representing a chosen calendar day. */
function storageYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SeriesAndWindow = {
  seriesStartDate: Date | null;
  seriesEndDate: Date | null;
  bookingOpensDaysAhead: number;
  /** Venue IANA timezone for “today” vs event-day comparisons. */
  timeZone: string;
};

/**
 * Absolute instant when a slot starts: local midnight on the instance’s calendar date
 * in `timeZone`, plus `startMin` minutes from local midnight (template semantics).
 */
export function slotStartInstant(instanceDate: Date, startMin: number, timeZone: string): Date {
  const tz = timeZone?.trim() || "America/Chicago";
  const ymd = storageYmd(instanceDate);
  const dt = DateTime.fromISO(`${ymd}T00:00:00`, { zone: tz }).plus({ minutes: startMin });
  if (!dt.isValid) {
    // Fallback if IANA id is wrong — avoids crashing booking
    return new Date(instanceDate.getTime() + startMin * 60 * 1000);
  }
  return dt.toJSDate();
}

export function isDateInSeriesRange(
  venue: Pick<SeriesAndWindow, "seriesStartDate" | "seriesEndDate">,
  eventDate: Date,
): boolean {
  const eventYmd = storageYmd(eventDate);
  if (venue.seriesStartDate) {
    const startYmd = storageYmd(venue.seriesStartDate);
    if (eventYmd < startYmd) return false;
  }
  if (venue.seriesEndDate) {
    const endYmd = storageYmd(venue.seriesEndDate);
    if (eventYmd > endYmd) return false;
  }
  return true;
}

export function isWithinBookingWindow(
  venue: Pick<SeriesAndWindow, "bookingOpensDaysAhead" | "timeZone">,
  eventDate: Date,
  now: Date = new Date(),
): boolean {
  const tz = venue.timeZone?.trim() || "America/Chicago";
  const eventYmd = storageYmd(eventDate);
  const eventDay = DateTime.fromISO(eventYmd, { zone: tz }).startOf("day");
  if (!eventDay.isValid) return false;
  const todayDay = DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz).startOf("day");
  const diffDays = eventDay.diff(todayDay, "days").days;
  if (diffDays < 0) return false;
  if (diffDays > venue.bookingOpensDaysAhead) return false;
  return true;
}

export function bookingBlockReason(venue: SeriesAndWindow, eventDate: Date, now: Date = new Date()): string | null {
  if (!isDateInSeriesRange(venue, eventDate)) {
    return "This date is outside the venue’s open mic date range.";
  }
  if (!isWithinBookingWindow(venue, eventDate, now)) {
    return `Bookings are only allowed up to ${venue.bookingOpensDaysAhead} days in advance (and not in the past).`;
  }
  return null;
}

export function slotRestrictionBlockReason(
  restriction: {
    bookingRestrictionMode: BookingRestrictionMode;
    restrictionHoursBefore?: number | null;
    onPremiseMaxDistanceMeters?: number | null;
    lat: number | null;
    lng: number | null;
  },
  slotStartUtc: Date,
  now: Date = new Date(),
  clientLocation?: { lat: number; lng: number },
  opts?: { onPremiseMissingLocationShouldBlock?: boolean; restrictionTimeZone?: string },
): string | null {
  if (slotStartUtc.getTime() <= now.getTime()) return "This slot has already started.";

  const mode = restriction.bookingRestrictionMode;
  const tz = opts?.restrictionTimeZone?.trim() || "America/Chicago";

  if (mode === "NONE") return null;

  if (mode === "ATTENDEE_DAY_OF") {
    const nowDay = DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz).startOf("day");
    const slotDay = DateTime.fromJSDate(slotStartUtc, { zone: "utc" }).setZone(tz).startOf("day");
    if (nowDay < slotDay) return "Reserved for attendees. Booking opens on the day of the show.";
    return null;
  }

  if (mode === "HOURS_BEFORE") {
    const hours = restriction.restrictionHoursBefore ?? 6;
    const unlockAt = new Date(slotStartUtc.getTime() - hours * 60 * 60 * 1000);
    if (now.getTime() < unlockAt.getTime()) return `Booking opens ${hours} hours before the show start.`;
    return null;
  }

  if (mode === "ON_PREMISE") {
    const hours = restriction.restrictionHoursBefore ?? 6;
    const unlockAt = new Date(slotStartUtc.getTime() - hours * 60 * 60 * 1000);
    if (now.getTime() < unlockAt.getTime()) return `On-premise booking opens ${hours} hours before start.`;

    const venueLat = restriction.lat;
    const venueLng = restriction.lng;
    if (venueLat == null || venueLng == null) return "Venue location is missing.";
    if (!clientLocation) {
      if (opts?.onPremiseMissingLocationShouldBlock === false) return null;
      return "Location permission required to reserve this slot.";
    }

    const R = 6371000;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(clientLocation.lat - venueLat);
    const dLng = toRad(clientLocation.lng - venueLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(venueLat)) * Math.cos(toRad(clientLocation.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    const maxM = restriction.onPremiseMaxDistanceMeters ?? 1000;
    if (dist > maxM) return "You are too far from the venue to reserve this slot.";
    return null;
  }

  return null;
}
