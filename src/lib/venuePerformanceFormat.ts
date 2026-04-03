import type { VenuePerformanceFormat } from "@/generated/prisma/client";

export const VENUE_PERFORMANCE_FORMAT_OPTIONS: { value: VenuePerformanceFormat; label: string }[] = [
  { value: "OPEN_VARIETY", label: "Open variety (mixed acts)" },
  { value: "ACOUSTIC_ONLY", label: "Acoustic only" },
  { value: "GUITAR_VOCAL_ONLY", label: "Guitar & vocals only" },
  { value: "FULL_BANDS_ALLOWED", label: "Full bands allowed" },
  { value: "COMEDY", label: "Comedy" },
  { value: "SPOKEN_WORD", label: "Spoken word" },
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
