import { BookingRestrictionMode } from "@/generated/prisma/enums";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type SeriesAndWindow = {
  seriesStartDate: Date | null;
  seriesEndDate: Date | null;
  bookingOpensDaysAhead: number;
};

export function isDateInSeriesRange(
  venue: Pick<SeriesAndWindow, "seriesStartDate" | "seriesEndDate">,
  eventDate: Date,
): boolean {
  const day = startOfUtcDay(eventDate).getTime();
  if (venue.seriesStartDate) {
    if (day < startOfUtcDay(venue.seriesStartDate).getTime()) return false;
  }
  if (venue.seriesEndDate) {
    if (day > startOfUtcDay(venue.seriesEndDate).getTime()) return false;
  }
  return true;
}

export function isWithinBookingWindow(
  venue: Pick<SeriesAndWindow, "bookingOpensDaysAhead">,
  eventDate: Date,
  now: Date = new Date(),
): boolean {
  const today = startOfUtcDay(now).getTime();
  const slotDay = startOfUtcDay(eventDate).getTime();
  const diffDays = Math.round((slotDay - today) / (24 * 60 * 60 * 1000));
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
  opts?: { onPremiseMissingLocationShouldBlock?: boolean },
): string | null {
  if (slotStartUtc.getTime() <= now.getTime()) return "This slot has already started.";

  const mode = restriction.bookingRestrictionMode;

  if (mode === "NONE") return null;

  if (mode === "ATTENDEE_DAY_OF") {
    const nowDay = startOfUtcDay(now).getTime();
    const slotDay = startOfUtcDay(slotStartUtc).getTime();
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

    // Haversine distance (meters)
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
