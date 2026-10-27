import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { growthDiscoveryMaxCandidatesPerAdapterPerMarket } from "@/lib/growth/expansionConfig";
import type { BacklogPressure } from "@/lib/growth/backlogPressure";
import { trickleDiscoveryAdapters } from "@/lib/growth/backlogPressure";

/**
 * Autonomous web search is venue-only this phase: 100% of search calls / page fetches go to
 * `autonomous_web_search_venue` (multiplier 1). Same env knobs (`GROWTH_DISCOVERY_AUTONOMOUS_*`).
 */
export function autonomousWebSearchBudgetMultiplier(_adapterId: string): number {
  if (_adapterId === "autonomous_web_search_venue") return 1;
  return 1.15;
}

/** Per-adapter cap from `GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER` (unchanged env name). */
export function discoveryIngestCapForAdapter(
  _adapter: GrowthLeadSourceAdapter,
  pressure?: BacklogPressure | null,
): number {
  const base = growthDiscoveryMaxCandidatesPerAdapterPerMarket();
  let cap: number;
  if (_adapter.id === "autonomous_web_search_venue") {
    cap = Math.max(220, Math.round(base * 0.92));
  } else if (_adapter.id === "autonomous_seed_url_crawl_venue" || _adapter.id === "autonomous_eventbrite_chicago") {
    cap = Math.max(80, Math.round(base * 1.2));
  } else if (_adapter.id === "autonomous_host_search_promoter") {
    cap = Math.max(20, Math.round(base * 0.2));
  } else if (_adapter.id.startsWith("chicagoland_")) {
    cap = Math.max(100, Math.round(base * 1.25));
  } else {
    cap = base;
  }
  if (pressure?.trickleOnly) {
    if (!trickleDiscoveryAdapters(_adapter.id)) return 0;
    return Math.max(6, Math.min(12, Math.round(cap * pressure.discoveryIngestMultiplier)));
  }
  return cap;
}

/** Human-readable note for cron JSON / ops. */
export function growthDiscoveryAllocationSummary(pressure?: BacklogPressure | null): string {
  if (pressure?.trickleOnly) {
    return `Backlog pressure on (${pressure.reason}). New discovery is a nationwide web-search trickle only; runtime is allocated to place verify, evidence, schedule confirmation, official contact mining, and promote/reject.`;
  }
  return "Discovery priority: internal/stub seeds -> curated adapters -> direct crawlers (seed crawl/Eventbrite) -> SerpAPI venue web search when quota/state allows, then Brave Search API fallback. SerpAPI is premium, capped, and circuit-breaker guarded.";
}
