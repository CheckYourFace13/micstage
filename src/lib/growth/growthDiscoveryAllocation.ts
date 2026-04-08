import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { growthDiscoveryMaxCandidatesPerAdapterPerMarket } from "@/lib/growth/expansionConfig";

/** Fixed split for autonomous web-search adapters: ~90% venue / 5% artist / 5% promoter (same env caps, scaled in code). */
const VENUE_WEB_WEIGHT = 0.9;
const ARTIST_WEB_WEIGHT = 0.05;
const PROMOTER_WEB_WEIGHT = 0.05;

const WEB_SEARCH_IDS = {
  venue: "autonomous_web_search_venue",
  artist: "autonomous_web_search_artist",
  promoter: "autonomous_web_search_promoter",
} as const;

/**
 * Multiplier applied to GROWTH_DISCOVERY_AUTONOMOUS_* search/page-fetch counts for this adapter.
 * Venue web search = 1; artist/promoter ≈ 5/90 each.
 */
export function autonomousWebSearchBudgetMultiplier(adapterId: string): number {
  if (adapterId === WEB_SEARCH_IDS.venue) return 1;
  if (adapterId === WEB_SEARCH_IDS.artist) return ARTIST_WEB_WEIGHT / VENUE_WEB_WEIGHT;
  if (adapterId === WEB_SEARCH_IDS.promoter) return PROMOTER_WEB_WEIGHT / VENUE_WEB_WEIGHT;
  return 1;
}

/**
 * Per-adapter ingest cap from `GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER` (venue ceiling).
 * Non-venue web adapters get a small slice; seed crawl + Eventbrite + stubs + curated keep full cap.
 */
export function discoveryIngestCapForAdapter(adapter: GrowthLeadSourceAdapter): number {
  const base = growthDiscoveryMaxCandidatesPerAdapterPerMarket();
  if (adapter.id === WEB_SEARCH_IDS.artist) {
    return Math.max(5, Math.round((base * ARTIST_WEB_WEIGHT) / VENUE_WEB_WEIGHT));
  }
  if (adapter.id === WEB_SEARCH_IDS.promoter) {
    return Math.max(5, Math.round((base * PROMOTER_WEB_WEIGHT) / VENUE_WEB_WEIGHT));
  }
  return base;
}

/** Human-readable note for cron JSON / ops. */
export function growthDiscoveryAllocationSummary(): string {
  return `Web search budget: venue ${Math.round(VENUE_WEB_WEIGHT * 100)}%, artist ${Math.round(ARTIST_WEB_WEIGHT * 100)}%, promoter ${Math.round(PROMOTER_WEB_WEIGHT * 100)}% (caps from GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER + autonomous search/fetch env).`;
}
