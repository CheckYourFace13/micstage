import type { PrismaClient } from "@/generated/prisma/client";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import { growthDiscoveryMarketSlugs } from "@/lib/growth/marketsConfig";
import { allGrowthDiscoveryAdapters } from "@/lib/growth/sources/growthDiscoveryAdapters";

export type GrowthDiscoveryRunResult = {
  markets: string[];
  created: number;
  duplicates: number;
  skipped: number;
  byAdapter: Record<string, { created: number; duplicates: number; skipped: number }>;
};

/**
 * Runs all discovery adapters for configured markets and lead types; inserts DISCOVERED rows with dedupe.
 */
export async function runGrowthLeadDiscovery(prisma: PrismaClient): Promise<GrowthDiscoveryRunResult> {
  const markets = growthDiscoveryMarketSlugs();
  const adapters = allGrowthDiscoveryAdapters();
  const byAdapter: Record<string, { created: number; duplicates: number; skipped: number }> = {};
  let created = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const adapter of adapters) {
    byAdapter[adapter.id] = { created: 0, duplicates: 0, skipped: 0 };
  }

  for (const slug of markets) {
    for (const adapter of adapters) {
      const candidates = await adapter.discover({
        discoveryMarketSlug: slug,
        leadType: adapter.leadType,
      });
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

  return { markets, created, duplicates, skipped, byAdapter };
}
