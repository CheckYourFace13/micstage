/** Amazon Associates configuration for MicStage public resource pages. */

export const AMAZON_ASSOCIATES_TRACKING_ID = "micstage-20";
export const AMAZON_ASSOCIATES_NETWORK = "amazon" as const;

export type OpenMicGearAudience = "performers" | "hosts";

export type OpenMicGearItem = {
  /** Stable analytics category key (snake_case). */
  category: string;
  audience: OpenMicGearAudience;
  title: string;
  /** What to look for — original MicStage guidance, not product copy. */
  guidance: string;
  /** Amazon search keywords (spaces OK; encoded in URL). */
  searchKeywords: string;
};

/**
 * Durable Amazon search links (not specific ASINs/prices).
 * Keep search terms stable so links remain useful as catalogs change.
 */
export const OPEN_MIC_GEAR_ITEMS: readonly OpenMicGearItem[] = [
  {
    category: "dynamic_vocal_microphone",
    audience: "performers",
    title: "Dynamic vocal microphones",
    guidance:
      "Look for a handheld dynamic mic with a cardioid pattern — it rejects stage noise and feedback better than condensers in a typical bar or cafe. A durable grille and a standard XLR output matter more than boutique features for weekly open mics.",
    searchKeywords: "dynamic vocal microphone",
  },
  {
    category: "mic_stand",
    audience: "performers",
    title: "Mic stands",
    guidance:
      "A boom stand lets you adjust height and angle without crowding the performer. Prefer a weighted base and a clutch that holds under a dynamic mic plus cable — lightweight tripods tip easily on busy floors.",
    searchKeywords: "microphone stand",
  },
  {
    category: "xlr_cable",
    audience: "performers",
    title: "XLR cables",
    guidance:
      "Bring at least one spare XLR. Choose a length that reaches from stand to mixer without a trip hazard (often 15–25 ft). Neutrik-style connectors and a flexible jacket survive more nights than bargain cables that fail mid-set.",
    searchKeywords: "xlr cable",
  },
  {
    category: "instrument_cable",
    audience: "performers",
    title: "Guitar / instrument cables",
    guidance:
      "If you plug into the house DI or amp, pack a known-good 1/4\" cable. Right-angle plugs help on cramped stages; coiled cables reduce clutter but can add noise if cheap. Always test before your name is called.",
    searchKeywords: "instrument cable",
  },
  {
    category: "capo",
    audience: "performers",
    title: "Capos",
    guidance:
      "A reliable capo that clamps evenly across the neck saves awkward key changes. Spring or trigger styles are fast between songs; check that yours fits your neck profile so it does not buzz or pull flat.",
    searchKeywords: "guitar capo",
  },
  {
    category: "instrument_stand",
    audience: "performers",
    title: "Instrument stands",
    guidance:
      "A folding guitar stand keeps your instrument off sticky floors and out of walkways between sets. Look for stable contact points that will not scratch a finish and a footprint small enough for shared stages.",
    searchKeywords: "guitar stand",
  },
  {
    category: "portable_pa",
    audience: "hosts",
    title: "Portable PA systems",
    guidance:
      "For small rooms, a battery or AC portable PA with at least two mic/line inputs covers most open mics. Prioritize clear midrange vocals, easy volume control, and a form factor one person can load into a car.",
    searchKeywords: "portable pa system",
  },
  {
    category: "small_mixer",
    audience: "hosts",
    title: "Small mixers",
    guidance:
      "A compact mixer with a few XLR preamps, phantom power (for occasional condensers), and main outs to powered speakers is enough for variety nights. Prefer tactile knobs you can ride in the dark over menu-heavy interfaces.",
    searchKeywords: "small audio mixer",
  },
  {
    category: "powered_speaker",
    audience: "hosts",
    title: "Powered speakers",
    guidance:
      "Active (powered) speakers simplify cabling — line in from the mixer and AC power. Matched pairs help coverage; start with sizes suited to the room so you are not fighting feedback or blasting the front tables.",
    searchKeywords: "powered speaker",
  },
  {
    category: "microphone_bundle",
    audience: "hosts",
    title: "Microphone bundles",
    guidance:
      "Bundles that include a dynamic vocal mic, clip, and cable are a practical house kit. Stock two identical mics when you can so swaps are seamless if one fails during the night.",
    searchKeywords: "microphone bundle",
  },
  {
    category: "power_extension",
    audience: "hosts",
    title: "Extension / power solutions",
    guidance:
      "Map outlets before doors open. Use appropriately rated extension cords and a power strip with surge protection near the mixer — never daisy-chain cheap strips. Tape down cables where people walk.",
    searchKeywords: "power extension cord",
  },
  {
    category: "cable_organizer",
    audience: "hosts",
    title: "Cable organizers",
    guidance:
      "Velcro ties, cable sleeves, and a labeled bag cut teardown time and reduce lost XLRs. Color-coding mic vs instrument runs helps volunteers reset the stage between performers.",
    searchKeywords: "cable organizer",
  },
] as const;

export function amazonSearchUrl(searchKeywords: string): string {
  const params = new URLSearchParams({
    k: searchKeywords,
    tag: AMAZON_ASSOCIATES_TRACKING_ID,
  });
  return `https://www.amazon.com/s?${params.toString()}`;
}

export function openMicGearByAudience(audience: OpenMicGearAudience): OpenMicGearItem[] {
  return OPEN_MIC_GEAR_ITEMS.filter((item) => item.audience === audience);
}
