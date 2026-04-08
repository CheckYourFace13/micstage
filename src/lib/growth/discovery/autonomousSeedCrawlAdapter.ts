import { createHash } from "node:crypto";
import { CHICAGOLAND_SLUG } from "@/lib/growth/data/chicagolandDiscoverySeeds";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryCrawlMaxSeedsPerRun,
  growthDiscoveryCrawlSeedUrls,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml } from "@/lib/growth/discovery/extractFromHtml";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";

const ADAPTER_ID = "autonomous_seed_url_crawl_venue";
const CURSOR_KEY = "seed_offset";
const REGION = "IL";

function hashKey(url: string): string {
  const h = createHash("sha256").update(`seed|${url}`).digest("hex").slice(0, 22);
  return `crawl:${h}`;
}

/**
 * Fetches operator-provided seed URLs (comma list in env) and extracts contacts + same-host links.
 */
export function createAutonomousSeedCrawlVenueAdapter(): GrowthLeadSourceAdapter {
  return {
    id: ADAPTER_ID,
    leadType: "VENUE",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      if (!growthDiscoveryAutonomousEnabled()) return [];
      if (ctx.discoveryMarketSlug.trim().toLowerCase() !== CHICAGOLAND_SLUG) return [];
      if (!ctx.prisma) return [];

      const seeds = growthDiscoveryCrawlSeedUrls();
      if (seeds.length === 0) return [];

      const prisma = ctx.prisma;
      const offset = Number.parseInt((await readDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY)) ?? "0", 10) || 0;
      const batch = growthDiscoveryCrawlMaxSeedsPerRun();
      const slice = seeds.slice(offset, offset + batch);
      const nextOffset = offset + slice.length >= seeds.length ? 0 : offset + slice.length;
      await writeDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY, String(nextOffset));

      const out: GrowthLeadCandidate[] = [];
      for (const seed of slice) {
        const html = await discoveryFetchText(seed);
        if (!html) continue;
        const ex = extractFromHtml(seed, html, { maxSameHostLinks: 25 });
        const email = ex.emails[0] ?? null;
        const ig = ex.instagramUrls[0] ?? null;
        out.push({
          leadType: "VENUE",
          name: ex.nameGuess.slice(0, 180),
          contactEmailNormalized: email,
          websiteUrl: seed.split("#")[0]!,
          contactUrl: ex.sameHostPaths.find((u) => /contact|book|about|events/i.test(u)) ?? null,
          instagramUrl: ig,
          city: "Chicago",
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: ADAPTER_ID,
          sourceKind: "WEBSITE_CONTACT",
          fitScore: email ? 7 : 5,
          discoveryConfidence: email ? 58 : 42,
          importKey: hashKey(seed),
          internalNotes: `Seed URL crawl. Extra paths found: ${ex.sameHostPaths.length}.`,
        });
      }
      return out;
    },
  };
}
