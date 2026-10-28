import type { VenuePerformanceFormat } from "@/generated/prisma/client";

/** Canonical public label for performance-format enums. Never render CONSTANT_CASE. */
export function humanizeEnumLabel(raw: string): string {
  const words = String(raw ?? "")
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) return "";
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export function performanceFormatLabel(f: string | VenuePerformanceFormat | null | undefined): string {
  switch (f) {
    case "OPEN_VARIETY":
      return "Open variety";
    case "ACOUSTIC_ONLY":
      return "Acoustic";
    case "GUITAR_VOCAL_ONLY":
      return "Guitar & vocals";
    case "FULL_BANDS_ALLOWED":
      return "Full bands";
    case "COMEDY_SPOKEN_WORD":
      return "Comedy / spoken word";
    case "COMEDY":
      return "Comedy";
    case "SPOKEN_WORD":
      return "Spoken word";
    default:
      return humanizeEnumLabel(String(f ?? ""));
  }
}

export function equipmentProvidedList(venue: {
  providesPA: boolean;
  providesSpeakersMics: boolean;
  providesMonitors: boolean;
  providesDrumKit: boolean;
  providesBassAmp: boolean;
  providesGuitarAmp: boolean;
  providesKeyboard: boolean;
  providesDiBox: boolean;
  providesLightingBasic: boolean;
  providesBacklineShared: boolean;
}): string[] {
  const out: string[] = [];
  if (venue.providesPA) out.push("PA / house sound");
  if (venue.providesSpeakersMics) out.push("Speakers & microphones");
  if (venue.providesMonitors) out.push("Stage monitors");
  if (venue.providesDrumKit) out.push("Drum kit (shared or house)");
  if (venue.providesBassAmp) out.push("Bass amp");
  if (venue.providesGuitarAmp) out.push("Guitar amp");
  if (venue.providesKeyboard) out.push("Keyboard / piano");
  if (venue.providesDiBox) out.push("DI boxes");
  if (venue.providesLightingBasic) out.push("Basic stage lighting");
  if (venue.providesBacklineShared) out.push("Shared backline");
  return out;
}
