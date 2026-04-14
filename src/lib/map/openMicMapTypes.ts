import type { VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";

/**
 * Marker fills when a weekday filter is active — saturated for contrast on OSM tiles,
 * with white ring + inset shadow applied in `OpenMicLeafletMap`.
 */
export const OPEN_MIC_MAP_WEEKDAY_HEX: Record<Weekday, string> = {
  MON: "#1d4ed8",
  TUE: "#15803d",
  WED: "#b45309",
  THU: "#c2410c",
  FRI: "#b91c1c",
  SAT: "#7e22ce",
  SUN: "#0f766e",
};

/** MicStage accent when every night is shown (no weekday filter). */
export const OPEN_MIC_MAP_NEUTRAL_MARKER_HEX = "#e11d72";

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
