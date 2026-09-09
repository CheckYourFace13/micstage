/**
 * Coordinates for public listings must not come from the Places API: Maps Platform terms cap
 * Places latitude/longitude caching at 30 days and forbid showing Places content alongside a
 * non-Google map, and MicStage renders OpenStreetMap tiles. This module sources coordinates
 * from public-domain geocoders instead, so what we store and display carries no such limits.
 *
 * Primary: US Census Geocoder (public domain, US-only, no key, no usage cap).
 * Fallback: OpenStreetMap Nominatim (ODbL, requires a descriptive User-Agent and low rate).
 */

export type GeocodeSource = "census" | "nominatim";

export type GeocodeHit = {
  lat: number;
  lng: number;
  source: GeocodeSource;
  /** Address as returned by the geocoder, safe to store and display. */
  matchedAddress: string | null;
};

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "MicStage/1.0 (+https://micstage.com/about; open mic discovery)";

function finite(n: unknown): number | null {
  const v = typeof n === "string" ? Number.parseFloat(n) : typeof n === "number" ? n : Number.NaN;
  return Number.isFinite(v) ? v : null;
}

/** Directionals, state codes and country codes that read wrong in title case. */
const KEEP_UPPER = new Set([
  "N", "S", "E", "W", "NE", "NW", "SE", "SW", "US", "USA", "PO",
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC", "PR",
]);

/** Census returns SHOUTED addresses; title-case them so they are presentable. */
export function titleCaseAddress(raw: string): string {
  return raw
    .split(/(\s+|,)/)
    .map((token) => {
      if (!/[A-Za-z]/.test(token)) return token;
      const upper = token.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      return upper.charAt(0) + token.slice(1).toLowerCase();
    })
    .join("");
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeWithCensus(address: string): Promise<GeocodeHit | null> {
  const url = `${CENSUS_URL}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const data = (await fetchJson(url, 12_000)) as
    | { result?: { addressMatches?: Array<{ matchedAddress?: string; coordinates?: { x?: number; y?: number } }> } }
    | null;
  const match = data?.result?.addressMatches?.[0];
  const lat = finite(match?.coordinates?.y);
  const lng = finite(match?.coordinates?.x);
  if (lat == null || lng == null) return null;
  return {
    lat,
    lng,
    source: "census",
    matchedAddress: match?.matchedAddress ? titleCaseAddress(match.matchedAddress) : null,
  };
}

/**
 * Nominatim's usage policy allows about one request per second. Pace every attempt, including
 * failures, or a backlog run gets rate-limited and looks like "address not found".
 */
const NOMINATIM_MIN_INTERVAL_MS = 1200;
let nominatimNextAllowedAt = 0;

async function throttleNominatim(): Promise<void> {
  const wait = nominatimNextAllowedAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  nominatimNextAllowedAt = Date.now() + NOMINATIM_MIN_INTERVAL_MS;
}

async function geocodeWithNominatim(address: string): Promise<GeocodeHit | null> {
  await throttleNominatim();
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&countrycodes=us&format=json&limit=1`;
  const data = (await fetchJson(url, 12_000)) as Array<{ lat?: string; lon?: string; display_name?: string }> | null;
  const hit = data?.[0];
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon);
  if (lat == null || lng == null) return null;
  return { lat, lng, source: "nominatim", matchedAddress: hit?.display_name ?? null };
}

/**
 * Geocode a US street address without Google. Census handles street addresses well but returns
 * nothing for partial ones, so a city/region query falls through to Nominatim.
 */
export async function geocodeAddressWithoutGoogle(input: {
  formattedAddress?: string | null;
  city?: string | null;
  region?: string | null;
}): Promise<GeocodeHit | null> {
  const street = input.formattedAddress?.trim();
  if (street && /\d/.test(street)) {
    const censusHit = await geocodeWithCensus(street);
    if (censusHit) return censusHit;
  }

  const fallbackQuery =
    street ||
    [input.city?.trim(), input.region?.trim()].filter(Boolean).join(", ") ||
    null;
  if (!fallbackQuery) return null;
  return geocodeWithNominatim(fallbackQuery);
}
