import type { VenuePerformanceFormat } from "@/generated/prisma/client";
import { performanceFormatLabel } from "@/lib/venueDisplay";

export const VENUE_PERFORMANCE_FORMAT_OPTIONS: { value: VenuePerformanceFormat; label: string }[] = [
  { value: "OPEN_VARIETY", label: performanceFormatLabel("OPEN_VARIETY") },
  { value: "ACOUSTIC_ONLY", label: performanceFormatLabel("ACOUSTIC_ONLY") },
  { value: "GUITAR_VOCAL_ONLY", label: performanceFormatLabel("GUITAR_VOCAL_ONLY") },
  { value: "FULL_BANDS_ALLOWED", label: performanceFormatLabel("FULL_BANDS_ALLOWED") },
  { value: "COMEDY", label: performanceFormatLabel("COMEDY") },
  { value: "SPOKEN_WORD", label: performanceFormatLabel("SPOKEN_WORD") },
];

/** Values accepted from forms/API; includes legacy DB value until fully retired. */
const ALLOWED = new Set<VenuePerformanceFormat>([
  ...VENUE_PERFORMANCE_FORMAT_OPTIONS.map((o) => o.value),
  "COMEDY_SPOKEN_WORD",
]);

export function parseVenuePerformanceFormat(raw: string | undefined | null, fallback: VenuePerformanceFormat) {
  const v = raw?.trim();
  if (v && ALLOWED.has(v as VenuePerformanceFormat)) return v as VenuePerformanceFormat;
  return fallback;
}
