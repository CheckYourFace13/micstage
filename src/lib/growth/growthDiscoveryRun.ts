import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthDiscoveryAdapterInfo } from "@/lib/growth/discoveryAdapterCatalog";
import { listGrowthDiscoveryAdapterRegistry } from "@/lib/growth/discoveryAdapterCatalog";
import {
  autonomousWebSearchBudgetMultiplier,
  discoveryIngestCapForAdapter,
  growthDiscoveryAllocationSummary,
} from "@/lib/growth/growthDiscoveryAllocation";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import {
  hasGoogleProgrammableSearch,
  hasSerpApi,
  growthSerpApiCostPerCallUsd,
  growthSerpApiEnabled,
} from "@/lib/growth/discovery/autonomousConfig";
import { readSerpApiMetricsForMarket } from "@/lib/growth/discovery/webSearch";
import { growthDiscoveryMarketSlugs } from "@/lib/growth/marketsConfig";
import { allGrowthDiscoveryAdapters } from "@/lib/growth/sources/growthDiscoveryAdapters";

export type GrowthDiscoveryRunResult = {
  markets: string[];
  created: number;
  duplicates: number;
  skipped: number;
  byAdapter: Record<string, { created: number; duplicates: number; skipped: number }>;
  /** Static catalog: which adapters are real vs stub_json env. */
  adapterRegistry: GrowthDiscoveryAdapterInfo[];
  /** Candidates passed to ingest per adapter (after per-market cap), pre-dedupe. */
  candidatesEmittedByAdapter: Record<string, number>;
  /** Adapter-level runtime failures captured without failing the full cron run. */
  adapterErrors: Record<string, string[]>;
  discoveryAllocationSummary: string;
  /** Effective per-adapter ingest cap this run (same env cap per adapter; autonomous web search is venue-only). */
  effectiveCapsByAdapter: Record<string, number>;
  serpapi_calls_today: number;
  serpapi_calls_month: number;
  serpapi_disabled_until: string | null;
  serpapi_last_429_at: string | null;
  serpapi_reason: string | null;
  candidates_by_source: Record<string, number>;
  drafts_created_by_source: Record<string, number>;
  sent_by_source: Record<string, number>;
  cost_per_candidate_by_source_usd: Record<string, number>;
  search_provider_status: {
    serpapi_configured: boolean;
    serpapi_enabled: boolean;
    google_cse_configured: boolean;
    fallback_ready: boolean;
    warning: string | null;
  };
};

/**
 * Runs all discovery adapters for configured markets and lead types; inserts DISCOVERED rows with dedupe.
 */
export async function runGrowthLeadDiscovery(prisma: PrismaClient): Promise<GrowthDiscoveryRunResult> {
  const markets = growthDiscoveryMarketSlugs();
  const adapters = allGrowthDiscoveryAdapters();
  const byAdapter: Record<string, { created: number; duplicates: number; skipped: number }> = {};
  const candidatesEmittedByAdapter: Record<string, number> = {};
  const adapterErrors: Record<string, string[]> = {};
  const effectiveCapsByAdapter: Record<string, number> = {};
  let created = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const adapter of adapters) {
    byAdapter[adapter.id] = { created: 0, duplicates: 0, skipped: 0 };
    candidatesEmittedByAdapter[adapter.id] = 0;
    adapterErrors[adapter.id] = [];
    effectiveCapsByAdapter[adapter.id] = discoveryIngestCapForAdapter(adapter);
  }

  for (const slug of markets) {
    for (const adapter of adapters) {
      try {
        const cap = discoveryIngestCapForAdapter(adapter);
        let candidates = await adapter.discover({
          discoveryMarketSlug: slug,
          leadType: adapter.leadType,
          prisma,
          autonomousWebSearchBudgetMultiplier: autonomousWebSearchBudgetMultiplier(adapter.id),
        });
        if (candidates.length > cap) {
          candidates = candidates.slice(0, cap);
        }
        candidatesEmittedByAdapter[adapter.id] = (candidatesEmittedByAdapter[adapter.id] ?? 0) + candidates.length;

        for (const cand of candidates) {
          try {
            const r = await ingestGrowthLeadCandidate(prisma, cand);
            if (r.status === "created") {
              created++;
              byAdapter[adapter.id].created++;
            } else if (r.status === "duplicate") {
              duplicates++;
              byAdapter[adapter.id].duplicates++;
            } else {
              skipped++;
              byAdapter[adapter.id].skipped++;
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const reason = `ingest failure (${slug}): ${message.slice(0, 400)}`;
            adapterErrors[adapter.id].push(reason);
            console.error("[growth discovery] adapter ingest failure", {
              adapterId: adapter.id,
              market: slug,
              reason,
            });
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const reason = `discover failure (${slug}): ${message.slice(0, 400)}`;
        adapterErrors[adapter.id].push(reason);
        console.error("[growth discovery] adapter discover failure", {
          adapterId: adapter.id,
          market: slug,
          reason,
        });
      }
    }
  }

  const adapterRegistry = listGrowthDiscoveryAdapterRegistry();

  const curatedProducers = adapterRegistry
    .filter((a) => a.tier === "curated")
    .map((a) => a.id)
    .filter((id) => (candidatesEmittedByAdapter[id] ?? 0) > 0);
  const autonomousProducers = adapterRegistry
    .filter((a) => a.tier === "autonomous")
    .map((a) => a.id)
    .filter((id) => (candidatesEmittedByAdapter[id] ?? 0) > 0);
  console.info("[growth discovery] curated adapters that emitted candidates this run", curatedProducers);
  console.info("[growth discovery] autonomous adapters that emitted candidates this run", autonomousProducers);
  console.info("[growth discovery] candidates emitted by adapter (post-cap)", candidatesEmittedByAdapter);
  const failedAdapters = Object.entries(adapterErrors)
    .filter(([, errs]) => errs.length > 0)
    .map(([id]) => id);
  if (failedAdapters.length) {
    console.error("[growth discovery] adapters with runtime failures this run", {
      failedAdapters,
      adapterErrors,
    });
  }

  const primaryMarket = markets[0] ?? "chicagoland-il";
  const serpMetrics = await readSerpApiMetricsForMarket(prisma, primaryMarket);
  const candidatesBySource: Record<string, number> = { ...candidatesEmittedByAdapter };
  const draftsCreatedBySource: Record<string, number> = {};
  const sentBySource: Record<string, number> = {};
  for (const source of Object.keys(candidatesBySource)) {
    const [draftCount, sentCount] = await Promise.all([
      prisma.growthLeadOutreachDraft.count({
        where: { lead: { source: { equals: source, mode: "insensitive" } } },
      }),
      prisma.growthLeadOutreachDraft.count({
        where: { status: "SENT", lead: { source: { equals: source, mode: "insensitive" } } },
      }),
    ]);
    draftsCreatedBySource[source] = draftCount;
    sentBySource[source] = sentCount;
  }
  const costPerCandidateBySourceUsd: Record<string, number> = {};
  const serpCandidates = candidatesBySource["autonomous_web_search_venue"] ?? 0;
  if (growthSerpApiEnabled() && serpCandidates > 0) {
    costPerCandidateBySourceUsd["autonomous_web_search_venue"] = Number(
      ((serpMetrics.callsToday * growthSerpApiCostPerCallUsd()) / Math.max(1, serpCandidates)).toFixed(4),
    );
  } else {
    costPerCandidateBySourceUsd["autonomous_web_search_venue"] = 0;
  }
  for (const source of Object.keys(candidatesBySource)) {
    if (!(source in costPerCandidateBySourceUsd)) {
      costPerCandidateBySourceUsd[source] = 0;
    }
  }

  return {
    markets,
    created,
    duplicates,
    skipped,
    byAdapter,
    adapterRegistry,
    candidatesEmittedByAdapter,
    adapterErrors,
    discoveryAllocationSummary: growthDiscoveryAllocationSummary(),
    effectiveCapsByAdapter,
    serpapi_calls_today: serpMetrics.callsToday,
    serpapi_calls_month: serpMetrics.callsMonth,
    serpapi_disabled_until: serpMetrics.disabledUntil,
    serpapi_last_429_at: serpMetrics.last429At,
    serpapi_reason: serpMetrics.reason,
    candidates_by_source: candidatesBySource,
    drafts_created_by_source: draftsCreatedBySource,
    sent_by_source: sentBySource,
    cost_per_candidate_by_source_usd: costPerCandidateBySourceUsd,
    search_provider_status: {
      serpapi_configured: hasSerpApi(),
      serpapi_enabled: growthSerpApiEnabled(),
      google_cse_configured: hasGoogleProgrammableSearch(),
      fallback_ready: hasGoogleProgrammableSearch(),
      warning: !hasGoogleProgrammableSearch()
        ? "Google CSE fallback is not configured. If SerpAPI is disabled/exhausted, web-search adapter will emit 0 candidates."
        : null,
    },
  };
}
