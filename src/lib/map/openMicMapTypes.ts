import type { VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";

/** Marker colors when a weekday filter is active (matches product spec). */
export const OPEN_MIC_MAP_WEEKDAY_HEX: Record<Weekday, string> = {
  MON: "#2563eb",
  TUE: "#16a34a",
  WED: "#ca8a04",
  THU: "#ea580c",
  FRI: "#dc2626",
  SAT: "#9333ea",
  SUN: "#0d9488",
};

/** MicStage accent when no weekday filter is selected. */
export const OPEN_MIC_MAP_NEUTRAL_MARKER_HEX = "#ff2d95";

export type OpenMicMapTemplateDto = {
  id: string;
  title: string;
  weekday: Weekday;
  startTimeMin: number;
  endTimeMin: number;
  performanceFormat: VenuePerformanceFormat;
  bookingRestrictionMode: string;
};

export type OpenMicMapNextEventDto = {
  ymd: string;
  templateTitle: string;
  weekday: Weekday;
  timeLabel: string;
  badge: "live" | "tonight" | "upcoming";
};

export type OpenMicMapVenueDto = {
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number;
  lng: number;
  timeZone: string;
  templates: OpenMicMapTemplateDto[];
  weekdays: Weekday[];
  performanceFormats: VenuePerformanceFormat[];
  nextEvent: OpenMicMapNextEventDto | null;
  /** Has at least one non–house-only template with an AVAILABLE slot on a bookable future instance. */
  acceptingSignups: boolean;
};
