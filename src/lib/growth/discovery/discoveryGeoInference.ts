import { nationalDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";

const CHICAGOLAND_HINT = /\b(chicago|chicagoland|evanston|skokie|oak park|wicker park|logan square|rogers park|andersonville|hyde park|pilsen|lakeview|lincoln park|bucktown|uptown|berwyn|cicero|aurora|naperville|joliet|schaumburg|arlington heights)\b/i;

const CITY_ST = /\b([A-Za-z][A-Za-z\s.'-]{1,42}),\s*([A-Z]{2})\b/g;

/**
 * Map Serp title/snippet/query + URL into a discovery rollup slug for growth leads.
 * Falls back to `national-discovery-us` when geo is unclear (expansion queue).
 */
export function inferDiscoveryGeoForNationwideSearch(input: {
  title: string;
  snippet: string;
  searchQuery: string;
  pageUrl: string;
}): { discoveryMarketSlug: string; city: string | null; region: string | null } {
  const bundle = `${input.title}\n${input.snippet}\n${input.searchQuery}`.slice(0, 12_000);

  if (CHICAGOLAND_HINT.test(bundle)) {
    return { discoveryMarketSlug: "chicagoland-il", city: null, region: "IL" };
  }

  CITY_ST.lastIndex = 0;
  let best: { city: string; st: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = CITY_ST.exec(bundle)) !== null) {
    const city = m[1]!.trim().replace(/\s+/g, " ");
    const st = m[2]!.toUpperCase();
    if (city.length < 2 || st.length !== 2) continue;
    if (!best || city.length >= best.city.length) best = { city, st };
  }
  if (best) {
    if (best.st === "IL" && CHICAGOLAND_HINT.test(best.city)) {
      return { discoveryMarketSlug: "chicagoland-il", city: best.city, region: "IL" };
    }
    return {
      discoveryMarketSlug: `open-mics-${best.st.toLowerCase()}`,
      city: best.city,
      region: best.st,
    };
  }

  try {
    const host = new URL(input.pageUrl).hostname.toLowerCase();
    if (host.includes("eventbrite.")) {
      return { discoveryMarketSlug: nationalDiscoveryMarketSlug(), city: null, region: null };
    }
  } catch {
    /* skip */
  }

  return { discoveryMarketSlug: nationalDiscoveryMarketSlug(), city: null, region: null };
}
