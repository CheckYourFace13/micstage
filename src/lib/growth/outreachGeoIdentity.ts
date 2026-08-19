/**
 * Geographic identity match for outreach auto-send.
 * A shared business name in the wrong city/state must not be emailed.
 */
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";

const REGION_ALIASES: Record<string, string> = {
  ontario: "ON",
  on: "ON",
  wisconsin: "WI",
  wi: "WI",
  texas: "TX",
  tx: "TX",
  california: "CA",
  ca: "CA",
  "new york": "NY",
  ny: "NY",
  illinois: "IL",
  il: "IL",
  florida: "FL",
  fl: "FL",
  ohio: "OH",
  oh: "OH",
  pennsylvania: "PA",
  pa: "PA",
  michigan: "MI",
  mi: "MI",
  minnesota: "MN",
  mn: "MN",
  missouri: "MO",
  mo: "MO",
  georgia: "GA",
  ga: "GA",
  "north carolina": "NC",
  nc: "NC",
  "south carolina": "SC",
  sc: "SC",
  colorado: "CO",
  co: "CO",
  washington: "WA",
  wa: "WA",
  oregon: "OR",
  or: "OR",
  arizona: "AZ",
  az: "AZ",
  nevada: "NV",
  nv: "NV",
  tennessee: "TN",
  tn: "TN",
  massachusetts: "MA",
  ma: "MA",
  "british columbia": "BC",
  bc: "BC",
  alberta: "AB",
  ab: "AB",
  quebec: "QC",
  qc: "QC",
  vermont: "VT",
  vt: "VT",
  indiana: "IN",
  in: "IN",
};

/** City token → typical region. Used when a domain encodes a city (cactusclubmilwaukee). */
const CITY_HOME_REGION: Record<string, string> = {
  milwaukee: "WI",
  chicago: "IL",
  toronto: "ON",
  vancouver: "BC",
  dallas: "TX",
  houston: "TX",
  austin: "TX",
  nashville: "TN",
  denver: "CO",
  seattle: "WA",
  portland: "OR",
  phoenix: "AZ",
  boston: "MA",
  atlanta: "GA",
  miami: "FL",
  tampa: "FL",
  orlando: "FL",
  cleveland: "OH",
  columbus: "OH",
  detroit: "MI",
  minneapolis: "MN",
  "kansas city": "MO",
  "las vegas": "NV",
  vegas: "NV",
  charlotte: "NC",
  indianapolis: "IN",
};

const KNOWN_CITIES = new Set([
  ...Object.keys(CITY_HOME_REGION),
  "london",
  "doral",
  "greensboro",
  "placerville",
  "burlington",
  "indianapolis",
]);

export type OutreachGeoCheck = {
  ok: boolean;
  conflict: boolean;
  summary: string;
};

function normRegion(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const k = raw.trim().toLowerCase().replace(/\./g, "");
  if (REGION_ALIASES[k]) return REGION_ALIASES[k];
  if (/^[a-z]{2}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  return raw.trim().toUpperCase().slice(0, 3);
}

function normCity(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostTokens(host: string | null | undefined): string[] {
  if (!host?.trim()) return [];
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.(com|net|org|ca|us|co|io)$/i, "");
  const parts = h.split(/[^a-z]+/).filter((p) => p.length >= 5);
  const glued: string[] = [];
  for (const city of KNOWN_CITIES) {
    if (!city.includes(" ") && h.includes(city)) glued.push(city);
  }
  return [...new Set([...parts, ...glued])];
}

function citiesFromAddress(address: string | null | undefined): string[] {
  if (!address?.trim()) return [];
  const lower = address.toLowerCase();
  const found: string[] = [];
  for (const city of KNOWN_CITIES) {
    if (lower.includes(city)) found.push(city);
  }
  return found;
}

export type OutreachGeoInput = {
  name?: string | null;
  city?: string | null;
  region?: string | null;
  formattedAddress?: string | null;
  listingCity?: string | null;
  listingRegion?: string | null;
  websiteHostNormalized?: string | null;
  websiteUrl?: string | null;
  discoveryMarketSlug?: string | null;
};

export function classifyOutreachGeoIdentity(input: OutreachGeoInput): OutreachGeoCheck {
  if (
    listingHasGeoConflict({
      region: input.region ?? input.listingRegion,
      city: input.city ?? input.listingCity,
      formattedAddress: input.formattedAddress,
      name: input.name ?? "",
      discoveryMarketSlug: input.discoveryMarketSlug,
    })
  ) {
    return { ok: false, conflict: true, summary: "listing region conflicts with address" };
  }

  const listingCity = normCity(input.city) || normCity(input.listingCity);
  const listingRegion = normRegion(input.region) || normRegion(input.listingRegion);
  const host = (input.websiteHostNormalized || "").replace(/^www\./, "").toLowerCase();
  const domainCities = hostTokens(host);
  const addressCities = citiesFromAddress(input.formattedAddress);

  const domainCity = domainCities.find((c) => KNOWN_CITIES.has(c) && CITY_HOME_REGION[c]);
  if (listingCity && domainCity && listingCity !== domainCity && !listingCity.includes(domainCity) && !domainCity.includes(listingCity)) {
    return {
      ok: false,
      conflict: true,
      summary: `listing city (${listingCity}) conflicts with domain city (${domainCity})`,
    };
  }

  const domainRegion = domainCity ? CITY_HOME_REGION[domainCity] : null;
  if (listingRegion && domainRegion && listingRegion !== domainRegion) {
    return {
      ok: false,
      conflict: true,
      summary: `listing region (${listingRegion}) conflicts with domain region (${domainRegion})`,
    };
  }

  const addrCity = addressCities[0];
  if (listingCity && addrCity && listingCity !== addrCity && !listingCity.includes(addrCity)) {
    return {
      ok: false,
      conflict: true,
      summary: `listing city (${listingCity}) conflicts with address city (${addrCity})`,
    };
  }

  return { ok: true, conflict: false, summary: listingCity || listingRegion ? "geo consistent" : "geo incomplete" };
}
