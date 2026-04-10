import { createHash } from "node:crypto";
import { isPrimaryLaunchDiscoveryMarket, primaryLaunchDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryCrawlMaxSeedsPerRun,
  growthDiscoveryCrawlSeedUrls,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml, pickPrimaryVenueContactUrl } from "@/lib/growth/discovery/extractFromHtml";
import { scoreOpenMicVenueProspect } from "@/lib/growth/discovery/venueOpenMicSignals";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { deriveVenueContactQuality } from "@/lib/growth/venueContactQuality";

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
      if (!isPrimaryLaunchDiscoveryMarket(ctx.discoveryMarketSlug)) return [];
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
        const fb = ex.facebookUrls[0] ?? null;
        const contactPick =
          pickPrimaryVenueContactUrl(ex.sameHostPaths) ??
          ex.sameHostPaths.find((u) => /contact|book|about|events/i.test(u)) ??
          null;

        let om = scoreOpenMicVenueProspect({
          snippet: "",
          pageTextSample: ex.bodyTextSample,
          title: ex.nameGuess,
          searchQuery: "operator seed (open-mic discovery)",
          hasEmail: Boolean(email),
          hasContactPath: Boolean(contactPick),
          hasSocial: Boolean(ig || fb),
        });

        if (!om.shouldIngest) {
          om = {
            ...om,
            tier: "WEAK_INFERRED",
            fitScore: Math.max(3, om.fitScore - 1),
            confidence: Math.max(om.confidence, 34),
            shouldIngest: true,
          };
        }

        const contactQuality = deriveVenueContactQuality({
          email,
          contactUrl: contactPick ?? ig ?? fb,
          instagramUrl: ig,
          facebookUrl: fb,
        });

        out.push({
          leadType: "VENUE",
          name: ex.nameGuess.slice(0, 180),
          contactEmailNormalized: email,
          emailExtractedFromNoisyText: true,
          websiteUrl: seed.split("#")[0]!,
          contactUrl: contactPick ?? ig ?? fb ?? null,
          instagramUrl: ig,
          facebookUrl: fb,
          city: "Chicago",
          region: REGION,
          discoveryMarketSlug: primaryLaunchDiscoveryMarketSlug(),
          source: ADAPTER_ID,
          sourceKind: "WEBSITE_CONTACT",
          fitScore: om.fitScore,
          discoveryConfidence: om.confidence,
          performanceTags: om.performanceTags.length ? om.performanceTags : [],
          openMicSignalTier: om.tier,
          contactQuality,
          importKey: hashKey(seed),
          internalNotes: `Seed URL crawl (venue-first). Tier ${om.tier}. Paths: ${ex.sameHostPaths.length}.`,
        });
      }
      return out;
    },
  };
}
