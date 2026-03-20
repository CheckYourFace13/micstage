/** Checkbox values stored in MusicianUser.specializations (JSON array). */
export const MUSICIAN_SPECIALIZATIONS: { value: string; label: string }[] = [
  { value: "SINGER_SONGWRITER", label: "Singer / songwriter" },
  { value: "VOCALS", label: "Vocals (front person)" },
  { value: "COMEDY", label: "Comedy" },
  { value: "SPOKEN_WORD", label: "Spoken word / poetry" },
  { value: "HIP_HOP", label: "Hip-hop / rap" },
  { value: "ELECTRONIC", label: "Electronic / DJ" },
  { value: "JAZZ", label: "Jazz" },
  { value: "COUNTRY", label: "Country" },
  { value: "ROCK", label: "Rock" },
  { value: "FOLK", label: "Folk / Americana" },
  { value: "R_AND_B", label: "R&B / soul" },
  { value: "MULTI_INSTRUMENTALIST", label: "Multi-instrumentalist" },
  { value: "BAND_LEADER", label: "Bandleader / group" },
];

/** Checkbox values stored in MusicianUser.instruments (JSON array). */
export const MUSICIAN_INSTRUMENTS: { value: string; label: string }[] = [
  { value: "VOCALS_ONLY", label: "Voice only" },
  { value: "ACOUSTIC_GUITAR", label: "Acoustic guitar" },
  { value: "ELECTRIC_GUITAR", label: "Electric guitar" },
  { value: "BASS", label: "Bass" },
  { value: "DRUMS", label: "Drums" },
  { value: "KEYS", label: "Keys / piano" },
  { value: "VIOLIN", label: "Violin / fiddle" },
  { value: "HARMONICA", label: "Harmonica" },
  { value: "UKULELE", label: "Ukulele" },
  { value: "HORN", label: "Brass / woodwind" },
  { value: "PERCUSSION", label: "Hand percussion" },
  { value: "OTHER", label: "Other" },
];

export function asStringArrayJson(value: unknown): string[] {
  if (!value || !Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export function formatVenuePickLabel(v: { name: string; city: string | null; region: string | null }): string {
  const loc = [v.city, v.region].filter(Boolean).join(", ");
  return loc ? `${v.name} — ${loc}` : v.name;
}
