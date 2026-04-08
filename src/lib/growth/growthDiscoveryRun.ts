import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthDiscoveryAdapterInfo } from "@/lib/growth/discoveryAdapterCatalog";
import { listGrowthDiscoveryAdapterRegistry } from "@/lib/growth/discoveryAdapterCatalog";
import { growthDiscoveryMaxCandidatesPerAdapterPerMarket } from "@/lib/growth/expansionConfig";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
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
};

/**
 * Runs all discovery adapters for configured markets and lead types; inserts DISCOVERED rows with dedupe.
 */
export async function runGrowthLeadDiscovery(prisma: PrismaClient): Promise<GrowthDiscoveryRunResult> {
  const markets = growthDiscoveryMarketSlugs();
  const adapters = allGrowthDiscoveryAdapters();
  const cap = growthDiscoveryMaxCandidatesPerAdapterPerMarket();
  const byAdapter: Record<string, { created: number; duplicates: number; skipped: number }> = {};
  const candidatesEmittedByAdapter: Record<string, number> = {};
  let created = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const adapter of adapters) {
    byAdapter[adapter.id] = { created: 0, duplicates: 0, skipped: 0 };
    candidatesEmittedByAdapter[adapter.id] = 0;
  }

  for (const slug of markets) {
    for (const adapter of adapters) {
      let candidates = await adapter.discover({
        discoveryMarketSlug: slug,
        leadType: adapter.leadType,
        prisma,
      });
      if (candidates.length > cap) {
        candidates = candidates.slice(0, cap);
      }
      candidatesEmittedByAdapter[adapter.id] = (candidatesEmittedByAdapter[adapter.id] ?? 0) + candidates.length;

      for (const cand of candidates) {
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

  return {
    markets,
    created,
    duplicates,
    skipped,
    byAdapter,
    adapterRegistry,
    candidatesEmittedByAdapter,
  };
}
