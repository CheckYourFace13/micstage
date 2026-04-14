import { VenuePerformanceFormat } from "@/generated/prisma/client";
import { performanceFormatLabel } from "@/lib/venueDisplay";

const ORDER: VenuePerformanceFormat[] = [
  VenuePerformanceFormat.OPEN_VARIETY,
  VenuePerformanceFormat.ACOUSTIC_ONLY,
  VenuePerformanceFormat.GUITAR_VOCAL_ONLY,
  VenuePerformanceFormat.FULL_BANDS_ALLOWED,
  VenuePerformanceFormat.COMEDY,
  VenuePerformanceFormat.SPOKEN_WORD,
  VenuePerformanceFormat.COMEDY_SPOKEN_WORD,
];

export const OPEN_MIC_MAP_FORMAT_FILTER_OPTIONS: { value: VenuePerformanceFormat; label: string }[] = ORDER.map((value) => ({
  value,
  label: performanceFormatLabel(value),
}));
