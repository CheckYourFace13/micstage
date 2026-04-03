import type { VenuePerformanceFormat } from "@/generated/prisma/client";

export function performanceFormatLabel(f: VenuePerformanceFormat): string {
  switch (f) {
    case "OPEN_VARIETY":
      return "Open variety (mixed acts)";
    case "ACOUSTIC_ONLY":
      return "Acoustic only";
    case "GUITAR_VOCAL_ONLY":
      return "Guitar & vocals only";
    case "FULL_BANDS_ALLOWED":
      return "Full bands allowed";
    case "COMEDY_SPOKEN_WORD":
      return "Comedy / spoken word";
    case "COMEDY":
      return "Comedy";
    case "SPOKEN_WORD":
      return "Spoken word";
    default:
      return f;
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
