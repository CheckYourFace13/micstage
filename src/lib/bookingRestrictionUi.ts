/** Shared labels for booking release modes (template defaults + per-slot overrides). */
export const BOOKING_RESTRICTION_OPTIONS: { value: string; label: string }[] = [
  { value: "NONE", label: "Book anytime within the booking window" },
  { value: "ATTENDEE_DAY_OF", label: "Reserved for attendees (unlock on the day)" },
  { value: "HOURS_BEFORE", label: "Unlock up to X hours before start" },
  { value: "ON_PREMISE", label: "On-premise only (location required) + X hours before start" },
];
