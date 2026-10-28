import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { growthDiscoveryMaxCandidatesPerAdapterPerMarket } from "@/lib/growth/expansionConfig";
import type { BacklogPressure } from "@/lib/growth/backlogPressure";

/**
 * Autonomous web search is venue-only this phase: 100% of search calls / page fetches go to
 * `autonomous_web_search_venue` (multiplier 1). Same env knobs (`GROWTH_DISCOVERY_AUTONOMOUS_*`).
 */
export function autonomousWebSearchBudgetMultiplier(_adapterId: string): number {
  if (_adapterId === "autonomous_web_search_venue") return 1;
  return 1.15;
}

/**
 * Per-adapter ingest cap from `GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER`.
 * Backlog pressure never reduces this — raw discovery stays at the maximum
 * safe rate allowed by existing Serp/API/cost/crawl budgets.
 */
export function discoveryIngestCapForAdapter(
  _adapter: GrowthLeadSourceAdapter,
  _pressure?: BacklogPressure | null,
): number {
  const base = growthDiscoveryMaxCandidatesPerAdapterPerMarket();
  if (_adapter.id === "autonomous_web_search_venue") {
    return Math.max(220, Math.round(base * 0.92));
  }
  if (_adapter.id === "autonomous_seed_url_crawl_venue" || _adapter.id === "autonomous_eventbrite_chicago") {
    return Math.max(80, Math.round(base * 1.2));
  }
  if (_adapter.id === "autonomous_host_search_promoter") {
    return Math.max(20, Math.round(base * 0.2));
  }
  if (_adapter.id.startsWith("chicagoland_")) {
    return Math.max(100, Math.round(base * 1.25));
  }
  return base;
}

/** Human-readable note for cron JSON / ops. */
export function growthDiscoveryAllocationSummary(_pressure?: BacklogPressure | null): string {
  return "Discovery runs at the maximum safe rate allowed by Serp/API budgets, provider quotas, cost caps, cron/runtime capacity, and website crawling safety. A large NEEDS_REVIEW reservoir does not throttle discovery.";
}
