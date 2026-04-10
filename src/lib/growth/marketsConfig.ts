/**
 * Market-first growth ops — **single source of truth for launch scope** (code):
 *
 * - **`DEFAULT_GROWTH_METRO_ID`** + **`GROWTH_METROS[].discoveryMarketSlug`** define the primary launch market slug
 *   (`primaryLaunchDiscoveryMarketSlug()`). Autonomous geo discovery, curated Chicagoland seed adapters, and default
 *   admin views all use this slug unless the cron iteration context is a different market (see below).
 * - **`GROWTH_DISCOVERY_MARKET_SLUGS`** (optional env, comma-separated): which discovery slugs the growth-pipeline cron
 *   iterates. If unset, defaults to `[primaryLaunchDiscoveryMarketSlug(), nationalDiscoveryMarketSlug()]` so curated
 *   primary-metro seeds and **nationwide** autonomous venue web search both run. Omit `national-discovery-us` only if
 *   you intentionally disable SerpAPI/CSE nationwide collection for that environment.
 *
 * `discoveryMarketSlug` values must match `/locations/[slug]` rollups (see `discoveryMarket.ts`).
 */
export type GrowthMetroConfig = {
  /** Stable id for URLs (?metro=) and saved views */
  id: string;
  /** Admin display */
  label: string;
  /** Same as discovery rollup slug, e.g. chicagoland-il */
  discoveryMarketSlug: string;
  /** Shown in CSV/manual defaults */
  regionDefault: string;
};

export const GROWTH_METROS: GrowthMetroConfig[] = [
  {
    id: "chicagoland",
    label: "Chicagoland",
    discoveryMarketSlug: "chicagoland-il",
    regionDefault: "IL",
  },
  // Clone this block for the next metro, e.g.:
  // { id: "austin", label: "Austin", discoveryMarketSlug: "austin-tx", regionDefault: "TX" },
];

/** Default market when admin omits `market` / `metro` query param. */
export const DEFAULT_GROWTH_METRO_ID = "chicagoland" as const;

export function defaultGrowthMetro(): GrowthMetroConfig {
  const m = GROWTH_METROS.find((x) => x.id === DEFAULT_GROWTH_METRO_ID);
  return m ?? GROWTH_METROS[0];
}

/**
 * Primary launch discovery slug — use for tagging leads from geo-scoped autonomous discovery and curated primary-metro
 * seeds, and for matching `ctx.discoveryMarketSlug` before emitting candidates.
 */
export function primaryLaunchDiscoveryMarketSlug(): string {
  return defaultGrowthMetro().discoveryMarketSlug;
}

/** Nationwide autonomous venue discovery lane (`/locations/national-discovery-us`); expansion / send gating unchanged. */
export function nationalDiscoveryMarketSlug(): string {
  return "national-discovery-us";
}

export function isNationalDiscoveryMarket(slug: string | null | undefined): boolean {
  if (!slug?.trim()) return false;
  return slug.trim().toLowerCase() === nationalDiscoveryMarketSlug();
}

export function isPrimaryLaunchDiscoveryMarket(slug: string | null | undefined): boolean {
  if (!slug?.trim()) return false;
  return slug.trim().toLowerCase() === primaryLaunchDiscoveryMarketSlug().toLowerCase();
}

export function growthMetroById(id: string | undefined | null): GrowthMetroConfig | undefined {
  if (!id?.trim()) return undefined;
  return GROWTH_METROS.find((m) => m.id === id.trim().toLowerCase());
}

export function growthMetroByDiscoverySlug(slug: string | undefined | null): GrowthMetroConfig | undefined {
  if (!slug?.trim()) return undefined;
  const t = slug.trim().toLowerCase();
  return GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === t);
}

/** Resolve admin `market` (slug) or `metro` (id) to a discovery slug; fallback default metro. */
export function resolveGrowthMarketSlug(params: { market?: string | null; metro?: string | null }): string {
  const fromSlug = params.market?.trim();
  if (fromSlug) return fromSlug;
  const fromMetro = growthMetroById(params.metro ?? null);
  if (fromMetro) return fromMetro.discoveryMarketSlug;
  return defaultGrowthMetro().discoveryMarketSlug;
}

/** Map env/list slugs to canonical `GROWTH_METROS` discovery slugs when they match case-insensitively. */
function canonicalDiscoveryMarketSlug(segment: string): string {
  const t = segment.trim();
  if (!t) return "";
  const metro = growthMetroByDiscoverySlug(t);
  return metro ? metro.discoveryMarketSlug : t;
}

/**
 * Markets where scheduled discovery may insert DISCOVERED leads (comma-separated slugs).
 * Defaults to primary metro **plus** `national-discovery-us` for nationwide autonomous venue search.
 * Segments are canonicalized when they match a known metro (fixes casing / minor mismatch vs `isPrimaryLaunchDiscoveryMarket`).
 */
export function growthDiscoveryMarketSlugs(): string[] {
  const raw = process.env.GROWTH_DISCOVERY_MARKET_SLUGS?.trim();
  if (!raw) {
    return [...new Set([primaryLaunchDiscoveryMarketSlug(), nationalDiscoveryMarketSlug()])];
  }
  return [...new Set(raw.split(",").map((s) => canonicalDiscoveryMarketSlug(s)).filter(Boolean))];
}
