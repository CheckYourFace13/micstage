import { cache } from "react";
import { getPrismaOrNull } from "@/lib/prisma";
import { locationDirectorySlug } from "@/lib/locationDirectorySlug";
import { slugify } from "@/lib/slug";

/**
 * Public discovery: small towns roll up to metro or regional hubs until they reach
 * enough listed venues to justify their own primary directory page.
 */
export const MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY = 10;

/**
 * Fixed discovery slugs for metro & regional hubs (not derived from a single city name).
 * Chicago rollup aligns with `primaryLaunchDiscoveryMarketSlug()` when Chicagoland is the default launch metro
 * (`marketsConfig` / `GROWTH_METROS`).
 */
export const ROLLUP_DISCOVERY_SLUGS = [
  "chicagoland-il",
  /** Pipeline bucket for nationwide autonomous venue discovery (not tied to an ACTIVE launch market). */
  "national-discovery-us",
] as const;

/** Legacy IL regional hubs — 301 to named state slug `illinois` (no redirect chains). */
const ILLINOIS_LEGACY_ROLLUP_ALIASES = ["illinois-regional", "central-illinois-il"] as const;

const ROLLUP_LABELS: Record<string, string> = {
  "chicagoland-il": "Chicagoland",
  "national-discovery-us": "United States (discovery queue)",
};

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "Washington, D.C.",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/**
 * Illinois communities commonly treated as Chicago metro for discovery (lowercase).
 * Other IL thin cities roll up to the named state hub `illinois`.
 */
const CHICAGOLAND_IL_CITIES = new Set(
  [
    "addison",
    "alsip",
    "arlington heights",
    "aurora",
    "barrington",
    "bartlett",
    "batavia",
    "bedford park",
    "bellwood",
    "bensenville",
    "berkeley",
    "berwyn",
    "blue island",
    "bolingbrook",
    "bridgeview",
    "broadview",
    "brookfield",
    "buffalo grove",
    "burbank",
    "burr ridge",
    "calumet city",
    "calumet park",
    "carol stream",
    "carpentersville",
    "cary",
    "chicago",
    "chicago heights",
    "cicero",
    "clarendon hills",
    "country club hills",
    "crest hill",
    "crete",
    "deerfield",
    "des plaines",
    "dolton",
    "downers grove",
    "elgin",
    "elk grove village",
    "elmhurst",
    "elmwood park",
    "evanston",
    "evergreen park",
    "forest park",
    "fox lake",
    "franklin park",
    "glen carbon",
    "glen ellyn",
    "glencoe",
    "glendale heights",
    "glenview",
    "grayslake",
    "gurnee",
    "hanover park",
    "harvey",
    "harwood heights",
    "hickory hills",
    "highland park",
    "highwood",
    "hillside",
    "hinsdale",
    "hoffman estates",
    "homewood",
    "itasca",
    "joliet",
    "kenilworth",
    "lake forest",
    "lake in the hills",
    "lake villa",
    "lake zurich",
    "lansing",
    "lemont",
    "lincolnshire",
    "lincolnwood",
    "lisle",
    "lockport",
    "lombard",
    "lyons",
    "maywood",
    "melrose park",
    "morton grove",
    "mount prospect",
    "mundelein",
    "naperville",
    "niles",
    "norridge",
    "northbrook",
    "northfield",
    "northlake",
    "oak forest",
    "oak lawn",
    "oak park",
    "orland hills",
    "orland park",
    "oswego",
    "palatine",
    "palos heights",
    "palos hills",
    "park forest",
    "park ridge",
    "plainfield",
    "prospect heights",
    "river forest",
    "river grove",
    "riverside",
    "rolling meadows",
    "romeoville",
    "roselle",
    "round lake",
    "round lake beach",
    "schaumburg",
    "schiller park",
    "skokie",
    "south holland",
    "streamwood",
    "tinley park",
    "vernon hills",
    "villa park",
    "warrenville",
    "wauconda",
    "waukegan",
    "west chicago",
    "westchester",
    "western springs",
    "westmont",
    "wheeling",
    "willowbrook",
    "willow springs",
    "wilmette",
    "winnetka",
    "wood dale",
    "woodridge",
    "worth",
    "zion",
  ].map((c) => c.toLowerCase()),
);

function normCity(city: string): string {
  return city.trim().toLowerCase();
}

function stateCodeFromRegion(region: string | null | undefined): string | null {
  const t = (region ?? "").trim();
  if (!t) return null;
  if (t.length === 2) return t.toUpperCase();
  const lower = t.toLowerCase();
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}

function isIllinois(region: string | null | undefined): boolean {
  const code = stateCodeFromRegion(region);
  return code === "IL";
}

function thinMarketRollupSlug(city: string, region: string | null | undefined): string {
  if (isIllinois(region) && CHICAGOLAND_IL_CITIES.has(normCity(city))) {
    return "chicagoland-il";
  }
  const st = stateCodeFromRegion(region);
  if (st) {
    const stateName = US_STATE_NAMES[st];
    if (stateName) {
      const named = slugify(stateName);
      if (named) return named; // e.g. illinois, oklahoma — not open-mics-xx
    }
    return `open-mics-${st.toLowerCase()}`;
  }
  return locationDirectorySlug(city, region);
}

/**
 * Growth / nationwide SERP geo: Chicagoland IL cities → `chicagoland-il`; other IL thin cities →
 * named state `illinois`; other US states → named state slug (legacy `open-mics-{st}` alias).
 * Does **not** apply venue-density “own city slug” rules — use `primaryDiscoverySlugForVenue` for that.
 */
export function discoveryRollupSlugFromCityRegion(city: string, region: string | null | undefined): string {
  return thinMarketRollupSlug(city, region);
}

export function computeCitySlugVenueCounts(
  venues: { city: string | null; region: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const slug = locationDirectorySlug(city, v.region);
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/**
 * Canonical public discovery slug for a venue row: dense city keeps its own slug; thin rolls up.
 */
export function primaryDiscoverySlugForVenue(
  city: string | null | undefined,
  region: string | null | undefined,
  counts: ReadonlyMap<string, number>,
): string {
  const c = (city ?? "").trim();
  if (!c) return "";
  const citySlug = locationDirectorySlug(c, region);
  if (!citySlug) return "";
  const n = counts.get(citySlug) ?? 0;
  if (n >= MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY) return citySlug;
  return thinMarketRollupSlug(c, region);
}

export function rollupDiscoveryLabel(slug: string): string | null {
  if (ROLLUP_LABELS[slug]) return ROLLUP_LABELS[slug];
  const legacy = /^open-mics-([a-z]{2})$/i.exec(slug);
  if (legacy) {
    const code = legacy[1]!.toUpperCase();
    return US_STATE_NAMES[code] ?? code;
  }
  // Named state slug e.g. "oklahoma" → "Oklahoma"
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    if (slugify(name) === slug) return name;
    void code;
  }
  return null;
}

/** True when slug is a US state rollup (named or legacy open-mics-xx), not a city/metro. */
export function isUsStateRollupSlug(slug: string): boolean {
  if (/^open-mics-[a-z]{2}$/i.test(slug)) return true;
  for (const name of Object.values(US_STATE_NAMES)) {
    if (slugify(name) === slug) return true;
  }
  return false;
}

/** Canonical state slug for a US state code (oklahoma), plus legacy open-mics-ok alias. */
export function usStateRollupSlug(stateCode: string): string | null {
  const code = stateCode.trim().toUpperCase();
  const name = US_STATE_NAMES[code];
  if (!name) return null;
  return slugify(name) || `open-mics-${code.toLowerCase()}`;
}

export function venueIncludedInDiscoveryPage(
  venue: { city: string | null; region: string | null },
  pageSlug: string,
  counts: ReadonlyMap<string, number>,
): boolean {
  const city = (venue.city ?? "").trim();
  if (!city) return false;
  const own = primaryDiscoverySlugForVenue(city, venue.region, counts);
  return own === pageSlug;
}

export type DiscoveryValidationData = {
  validSlugs: Set<string>;
  aliasToCanonical: Map<string, string>;
};

export function buildDiscoveryValidationData(
  venues: { city: string | null; region: string | null }[],
): DiscoveryValidationData {
  const counts = computeCitySlugVenueCounts(venues);
  const aliasToCanonical = new Map<string, string>();
  const validSlugs = new Set<string>();

  const cityKeyToRegions = new Map<string, Set<string>>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const cityKey = city.toLowerCase();
    const reg = (v.region ?? "").trim().toLowerCase();
    if (!cityKeyToRegions.has(cityKey)) cityKeyToRegions.set(cityKey, new Set());
    cityKeyToRegions.get(cityKey)!.add(reg);
  }

  const seenPairs = new Set<string>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const pairKey = `${city.toLowerCase()}|${(v.region ?? "").trim().toLowerCase()}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const citySlug = locationDirectorySlug(city, v.region);
    if (!citySlug) continue;
    const canonical = primaryDiscoverySlugForVenue(city, v.region, counts);

    validSlugs.add(citySlug);
    validSlugs.add(canonical);
    aliasToCanonical.set(canonical, canonical);
    if (citySlug !== canonical) aliasToCanonical.set(citySlug, canonical);

    const bare = slugify(city);
    if (bare) {
      const regionSet = cityKeyToRegions.get(city.toLowerCase()) ?? new Set<string>();
      if (regionSet.size <= 1) {
        aliasToCanonical.set(bare, canonical);
        validSlugs.add(bare);
      }
    }
  }

  for (const slug of ROLLUP_DISCOVERY_SLUGS) {
    validSlugs.add(slug);
    aliasToCanonical.set(slug, slug);
  }

  // Named US state hubs + legacy open-mics-{st} → named state (301 via canonical redirect).
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    const named = slugify(name);
    if (!named) continue;
    validSlugs.add(named);
    aliasToCanonical.set(named, named);
    const legacy = `open-mics-${code.toLowerCase()}`;
    validSlugs.add(legacy);
    aliasToCanonical.set(legacy, named);
  }

  // Legacy IL regional hubs → illinois (direct alias; never chain through each other).
  const illinoisCanonical = slugify(US_STATE_NAMES.IL!) || "illinois";
  for (const legacy of ILLINOIS_LEGACY_ROLLUP_ALIASES) {
    validSlugs.add(legacy);
    aliasToCanonical.set(legacy, illinoisCanonical);
  }

  return { validSlugs, aliasToCanonical };
}

export const getDiscoveryValidationFromDb = cache(async (): Promise<DiscoveryValidationData | null> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const [venues, listings] = await Promise.all([
      prisma.venue.findMany({
        where: { city: { not: null } },
        select: { city: true, region: true },
      }),
      prisma.publicOpenMicListing.findMany({
        where: { city: { not: null }, claimedVenueId: null, verificationStatus: "VERIFIED" },
        select: { city: true, region: true },
      }),
    ]);
    return buildDiscoveryValidationData([...venues, ...listings]);
  } catch {
    return null;
  }
});

export const getVenueCityDiscoveryCounts = cache(async (): Promise<Map<string, number>> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return new Map();
  try {
    const [venues, listings] = await Promise.all([
      prisma.venue.findMany({
        where: { city: { not: null } },
        select: { city: true, region: true },
      }),
      prisma.publicOpenMicListing.findMany({
        where: { city: { not: null }, claimedVenueId: null, verificationStatus: "VERIFIED" },
        select: { city: true, region: true },
      }),
    ]);
    return computeCitySlugVenueCounts([...venues, ...listings]);
  } catch {
    return new Map();
  }
});
