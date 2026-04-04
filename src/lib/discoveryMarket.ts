import { cache } from "react";
import { getPrismaOrNull } from "@/lib/prisma";
import { locationDirectorySlug } from "@/lib/locationDirectorySlug";
import { slugify } from "@/lib/slug";

/**
 * Public discovery / SEO: small towns roll up to metro or regional hubs until they reach
 * enough listed venues to justify their own primary indexable directory page.
 */
export const MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY = 10;

/** Fixed discovery slugs for metro & regional hubs (not derived from a single city name). */
export const ROLLUP_DISCOVERY_SLUGS = [
  "chicagoland-il",
  "central-illinois-il",
  "illinois-regional",
] as const;

const ROLLUP_LABELS: Record<string, string> = {
  "chicagoland-il": "Chicagoland",
  "central-illinois-il": "Central Illinois",
  "illinois-regional": "Illinois (regional)",
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
 * Excludes downstate college / central hubs (e.g. Champaign, Bloomington) covered separately.
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

/** Central / downstate Illinois hubs (lowercase). */
const CENTRAL_ILLINOIS_CITIES = new Set(
  [
    "bloomington",
    "normal",
    "champaign",
    "urbana",
    "peoria",
    "pekin",
    "east peoria",
    "springfield",
    "decatur",
    "charleston",
    "mattoon",
    "danville",
    "rantoul",
    "macomb",
    "galesburg",
    "kankakee",
    "quincy",
    "jacksonville",
    "taylorville",
    "lincoln",
    "carbondale",
    "marion",
    "benton",
    "effingham",
    "mt vernon",
    "mount vernon",
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
  if (isIllinois(region)) {
    const c = normCity(city);
    if (CHICAGOLAND_IL_CITIES.has(c)) return "chicagoland-il";
    if (CENTRAL_ILLINOIS_CITIES.has(c)) return "central-illinois-il";
    return "illinois-regional";
  }
  const st = stateCodeFromRegion(region);
  if (st) return `open-mics-${st.toLowerCase()}`;
  return locationDirectorySlug(city, region);
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
  const m = /^open-mics-([a-z]{2})$/i.exec(slug);
  if (m) {
    const code = m[1].toUpperCase();
    const name = US_STATE_NAMES[code] ?? code;
    return `${name} open mics`;
  }
  return null;
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

  return { validSlugs, aliasToCanonical };
}

export const getDiscoveryValidationFromDb = cache(async (): Promise<DiscoveryValidationData | null> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    return buildDiscoveryValidationData(venues);
  } catch {
    return null;
  }
});

export const getVenueCityDiscoveryCounts = cache(async (): Promise<Map<string, number>> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return new Map();
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    return computeCitySlugVenueCounts(venues);
  } catch {
    return new Map();
  }
});
