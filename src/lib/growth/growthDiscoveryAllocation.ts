import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { growthDiscoveryMaxCandidatesPerAdapterPerMarket } from "@/lib/growth/expansionConfig";

/**
 * Autonomous web search is venue-only this phase: 100% of search calls / page fetches go to
 * `autonomous_web_search_venue` (multiplier 1). Same env knobs (`GROWTH_DISCOVERY_AUTONOMOUS_*`).
 */
export function autonomousWebSearchBudgetMultiplier(_adapterId: string): number {
  return 1;
}

/** Per-adapter cap from `GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER` (unchanged env name). */
export function discoveryIngestCapForAdapter(_adapter: GrowthLeadSourceAdapter): number {
  return growthDiscoveryMaxCandidatesPerAdapterPerMarket();
}

/** Human-readable note for cron JSON / ops. */
export function growthDiscoveryAllocationSummary(): string {
  return "Autonomous web search: venue-only (100% of SerpAPI/CSE search + fetch budget). Artist/promoter autonomous web adapters are not registered. Caps: GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER + GROWTH_DISCOVERY_AUTONOMOUS_*.";
}
