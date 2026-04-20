import type { Prisma } from "@/generated/prisma/client";
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
  hasBraveSearch,
  hasSerpApi,
  growthSerpApiCostPerCallUsd,
  growthSerpApiEnabled,
} from "@/lib/growth/discovery/autonomousConfig";
import { readSerpApiMetricsForMarket } from "@/lib/growth/discovery/webSearch";
import {
  growthDiscoveryMarketSlugs,
  growthDiscoveryWebSearchMarketPriority,
  isGrowthDiscoveryWebSearchMarket,
  nationalDiscoveryMarketSlug,
} from "@/lib/growth/marketsConfig";
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
  /**
   * Same keys as `candidatesEmittedByAdapter`: **discovery adapter ids** (plus synthetic keys like web search), not
   * `GrowthLead.source` / `GrowthLeadSourceKind`. CSV/Claude uploads never appear here — see cron
   * `growthLeadsCreatedUtcTodayBySourceKind` for created rows by `sourceKind`.
   */
  candidates_by_source: Record<string, number>;
  drafts_created_by_source: Record<string, number>;
  sent_by_source: Record<string, number>;
  cost_per_candidate_by_source_usd: Record<string, number>;
  search_provider_status: {
    serpapi_configured: boolean;
    serpapi_enabled: boolean;
    /** Which `discoveryMarketSlug` row supplies `serpapi_calls_*` (nationwide search uses `national-discovery-us`). */
    serpapi_state_market: string;
    brave_search_configured: boolean;
    fallback_ready: boolean;
    warning: string | null;
  };
};

const MAX_ADAPTER_ERROR_LINES = 80;
const MAX_ADAPTER_ERROR_CHARS = 480;
const AUTONOMOUS_WEB_SEARCH_ADAPTER_ID = "autonomous_web_search_venue";

function discoveryRunSummaryForDb(r: GrowthDiscoveryRunResult): Prisma.InputJsonValue {
  const adapterErrors: Record<string, string[]> = {};
  for (const [id, errs] of Object.entries(r.adapterErrors)) {
    adapterErrors[id] = errs.slice(0, MAX_ADAPTER_ERROR_LINES).map((e) => e.slice(0, MAX_ADAPTER_ERROR_CHARS));
  }
  return {
    byAdapter: r.byAdapter,
    adapterRegistry: r.adapterRegistry,
    candidatesEmittedByAdapter: r.candidatesEmittedByAdapter,
    adapterErrors,
    discoveryAllocationSummary: r.discoveryAllocationSummary,
    effectiveCapsByAdapter: r.effectiveCapsByAdapter,
    serpapi_calls_today: r.serpapi_calls_today,
    serpapi_calls_month: r.serpapi_calls_month,
    serpapi_disabled_until: r.serpapi_disabled_until,
    serpapi_last_429_at: r.serpapi_last_429_at,
    serpapi_reason: r.serpapi_reason,
    candidates_by_source: r.candidates_by_source,
    drafts_created_by_source: r.drafts_created_by_source,
    sent_by_source: r.sent_by_source,
    cost_per_candidate_by_source_usd: r.cost_per_candidate_by_source_usd,
    search_provider_status: r.search_provider_status,
  } as Prisma.InputJsonValue;
}

async function persistGrowthDiscoveryRun(prisma: PrismaClient, r: GrowthDiscoveryRunResult): Promise<void> {
  const candidatesTotal = Object.values(r.candidatesEmittedByAdapter).reduce((a, b) => a + b, 0);
  try {
    await prisma.growthDiscoveryRun.create({
      data: {
        markets: r.markets,
        createdLeads: r.created,
        duplicateLeads: r.duplicates,
        skippedLeads: r.skipped,
        candidatesTotal,
        summary: discoveryRunSummaryForDb(r),
      },
    });
  } catch (e) {
    console.error("[growth discovery] GrowthDiscoveryRun persist failed", e);
  }
}

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

  const webSearchAdapter = adapters.find((a) => a.id === AUTONOMOUS_WEB_SEARCH_ADAPTER_ID);

  for (const slug of markets) {
    for (const adapter of adapters) {
      if (adapter.id === AUTONOMOUS_WEB_SEARCH_ADAPTER_ID) {
        continue;
      }
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

  if (webSearchAdapter) {
    const marketSetLower = new Set(markets.map((m) => m.trim().toLowerCase()));
    const webPriority = process.env.GROWTH_DISCOVERY_MARKET_SLUGS?.trim()
      ? growthDiscoveryWebSearchMarketPriority().filter((s) => marketSetLower.has(s.toLowerCase()))
      : [...growthDiscoveryWebSearchMarketPriority()];
    let pickedSlug: string | null = null;
    for (const slug of webPriority) {
      try {
        const cap = discoveryIngestCapForAdapter(webSearchAdapter);
        let candidates = await webSearchAdapter.discover({
          discoveryMarketSlug: slug,
          leadType: webSearchAdapter.leadType,
          prisma,
          autonomousWebSearchBudgetMultiplier: autonomousWebSearchBudgetMultiplier(webSearchAdapter.id),
        });
        if (candidates.length > cap) {
          candidates = candidates.slice(0, cap);
        }
        candidatesEmittedByAdapter[webSearchAdapter.id] =
          (candidatesEmittedByAdapter[webSearchAdapter.id] ?? 0) + candidates.length;

        for (const cand of candidates) {
          try {
            const r = await ingestGrowthLeadCandidate(prisma, cand);
            if (r.status === "created") {
              created++;
              byAdapter[webSearchAdapter.id].created++;
            } else if (r.status === "duplicate") {
              duplicates++;
              byAdapter[webSearchAdapter.id].duplicates++;
            } else {
              skipped++;
              byAdapter[webSearchAdapter.id].skipped++;
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const reason = `ingest failure (${slug}): ${message.slice(0, 400)}`;
            adapterErrors[webSearchAdapter.id].push(reason);
            console.error("[growth discovery] adapter ingest failure", {
              adapterId: webSearchAdapter.id,
              market: slug,
              reason,
            });
          }
        }

        if (candidates.length > 0) {
          pickedSlug = slug;
          console.info("[growth discovery] autonomous_web_search_venue priority stop", {
            pickedSlug,
            candidates: candidates.length,
          });
          break;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const reason = `discover failure (${slug}): ${message.slice(0, 400)}`;
        adapterErrors[webSearchAdapter.id].push(reason);
        console.error("[growth discovery] adapter discover failure", {
          adapterId: webSearchAdapter.id,
          market: slug,
          reason,
        });
      }
    }
    if (!pickedSlug && webPriority.length > 0) {
      console.info("[growth discovery] autonomous_web_search_venue priority exhausted", {
        tried: webPriority,
      });
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

  const nationalSlug = nationalDiscoveryMarketSlug();
  /** Serp quota/state row: use nationwide lane whenever any web-search market is in this run. */
  const serpMetricsMarketSlug = markets.some((m) => isGrowthDiscoveryWebSearchMarket(m))
    ? nationalSlug
    : (markets[0] ?? nationalSlug);
  const serpMetrics = await readSerpApiMetricsForMarket(prisma, serpMetricsMarketSlug);
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

  const result: GrowthDiscoveryRunResult = {
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
      serpapi_state_market: serpMetricsMarketSlug,
      brave_search_configured: hasBraveSearch(),
      fallback_ready: hasBraveSearch(),
      warning: !hasBraveSearch()
        ? "Brave Search API fallback is not configured (GROWTH_BRAVE_SEARCH_API_KEY). If SerpAPI is disabled or returns no data, web-search adapter may emit 0 candidates."
        : null,
    },
  };

  await persistGrowthDiscoveryRun(prisma, result);
  return result;
}
