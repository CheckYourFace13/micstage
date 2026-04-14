import type { VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";

/**
 * Subtle brand-safe tints used only when a weekday filter is active.
 * Default map state stays MicStage pink/black/white.
 */
export const OPEN_MIC_MAP_WEEKDAY_HEX: Record<Weekday, string> = {
  MON: "#f472b6",
  TUE: "#ec4899",
  WED: "#db2777",
  THU: "#be185d",
  FRI: "#9d174d",
  SAT: "#a1a1aa",
  SUN: "#ffffff",
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
  /** True when venue currently has at least one public recurring template. */
  hasPublicSchedule: boolean;
  nextEvent: OpenMicMapNextEventDto | null;
  /** Has at least one non–house-only template with an AVAILABLE slot on a bookable future instance. */
  acceptingSignups: boolean;
};
