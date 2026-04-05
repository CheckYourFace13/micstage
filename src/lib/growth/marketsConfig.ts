/**
 * Market-first growth ops. Add a row per metro you launch; set `DEFAULT_GROWTH_METRO_ID` for the active default.
 * `discoveryMarketSlug` must match `/locations/[slug]` slugs (see `discoveryMarket.ts`).
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

/**
 * Markets where scheduled discovery may insert DISCOVERED leads (comma-separated slugs).
 * Defaults to Chicagoland only so jobs never run “nationwide” unless you expand this list.
 */
export function growthDiscoveryMarketSlugs(): string[] {
  const raw = process.env.GROWTH_DISCOVERY_MARKET_SLUGS?.trim();
  if (!raw) return [defaultGrowthMetro().discoveryMarketSlug];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}
