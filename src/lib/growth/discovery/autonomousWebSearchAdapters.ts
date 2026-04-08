import { createHash } from "node:crypto";
import { isPrimaryLaunchDiscoveryMarket, primaryLaunchDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryAutonomousMaxPageFetchesPerRun,
  growthDiscoveryAutonomousSearchCallsPerRun,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml, pickPrimaryVenueContactUrl } from "@/lib/growth/discovery/extractFromHtml";
import { scoreOpenMicVenueProspect } from "@/lib/growth/discovery/venueOpenMicSignals";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { deriveVenueContactQuality } from "@/lib/growth/venueContactQuality";
import { discoverySearchProvider, runWebSearch, type SearchHit } from "@/lib/growth/discovery/webSearch";

const ADAPTER_ID = "autonomous_web_search_venue";
const CURSOR_KEY = "search_rotation";
const REGION = "IL";

type SearchCursor = {
  qi: number;
  start: number;
  prov: "google_cse" | "serpapi";
};

function parseCursor(raw: string | null, prov: "google_cse" | "serpapi"): SearchCursor {
  if (!raw) return { qi: 0, start: prov === "google_cse" ? 1 : 0, prov };
  try {
    const j = JSON.parse(raw) as Partial<SearchCursor>;
    return {
      qi: Number.isFinite(j.qi) ? Number(j.qi) : 0,
      start: Number.isFinite(j.start) ? Number(j.start) : prov === "google_cse" ? 1 : 0,
      prov: j.prov === "serpapi" || j.prov === "google_cse" ? j.prov : prov,
    };
  } catch {
    return { qi: 0, start: prov === "google_cse" ? 1 : 0, prov };
  }
}

function hashImport(url: string): string {
  const h = createHash("sha256").update(`${ADAPTER_ID}|${url}`).digest("hex").slice(0, 24);
  return `auto:${ADAPTER_ID}:${h}`;
}

/** Venue-only crawl: allow Facebook pages; skip pure social feeds and aggregators. */
function allowHitUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h.includes("google.") || h === "gstatic.com") return false;
    if (h.includes("instagram.com") || h.includes("tiktok.com")) return false;
    if (h.includes("facebook.com") || h.includes("fb.com")) return true;
    if (h.includes("youtube.com") || h.includes("youtu.be")) return false;
    if (h.includes("linkedin.com")) return false;
    if (h.includes("yelp.com") || h.includes("tripadvisor.")) return false;
    return true;
  } catch {
    return false;
  }
}

function cleanHitTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  const first = t.split(/\s*[|\u2013\u2014-]\s*/)[0]?.trim() ?? t;
  return first.slice(0, 180) || "Discovered prospect";
}

/** Open-mic–intent queries only — not generic venue booking. */
const VENUE_QUERIES = [
  '"open mic" Chicago IL',
  '"open mic night" Chicago Illinois',
  '"comedy open mic" Chicago',
  '"poetry open mic" Chicago',
  '"acoustic open mic" Chicago',
  '"mic night" Chicago bar OR venue',
  '"jam night" Chicago IL live music',
  '"singer songwriter night" Chicago',
  'site:eventbrite.com "open mic" Chicago',
  'Chicago IL "open mic" events calendar',
  'Evanston OR Skokie "open mic" night',
  'Logan Square OR Wicker Park "open mic"',
  'Chicago brewery "open mic" OR "mic night"',
  'Chicagoland coffeehouse OR cafe "open mic"',
  'Chicago IL comedy club "open mic" OR showcase',
  'Oak Park Berwyn "open mic" night',
  'Chicago "open stage" OR "amateur night" venue',
];

/**
 * SerpAPI / Google CSE → open-mic venue queries → page fetch → signal tier + contacts (Chicagoland only).
 * This phase: only autonomous web-search path registered (no artist/promoter web search).
 */
export function createAutonomousVenueWebSearchAdapter(): GrowthLeadSourceAdapter {
  return {
    id: ADAPTER_ID,
    leadType: "VENUE",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      if (!growthDiscoveryAutonomousEnabled()) return [];
      if (!isPrimaryLaunchDiscoveryMarket(ctx.discoveryMarketSlug)) return [];
      const provider = discoverySearchProvider();
      if (!provider || !ctx.prisma) return [];

      const prisma = ctx.prisma;
      const mult = Math.max(0.02, ctx.autonomousWebSearchBudgetMultiplier ?? 1);
      const searchCalls = Math.max(1, Math.round(growthDiscoveryAutonomousSearchCallsPerRun() * mult));
      const maxFetches = Math.max(2, Math.round(growthDiscoveryAutonomousMaxPageFetchesPerRun() * mult));
      const queries = VENUE_QUERIES;

      let cur = parseCursor(await readDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY), provider);
      if (cur.prov !== provider) {
        cur = { qi: cur.qi, start: provider === "google_cse" ? 1 : 0, prov: provider };
      }

      type TaggedHit = { hit: SearchHit; searchQuery: string };
      const hits: TaggedHit[] = [];
      for (let i = 0; i < searchCalls; i++) {
        const q = queries[cur.qi % queries.length]!;
        const res = await runWebSearch(q, { provider: cur.prov, start: cur.start });
        if (!res || res.items.length === 0) {
          cur.qi = (cur.qi + 1) % queries.length;
          cur.start = provider === "google_cse" ? 1 : 0;
          continue;
        }
        for (const it of res.items) {
          if (allowHitUrl(it.link)) hits.push({ hit: it, searchQuery: q });
        }
        cur.start = res.nextCursor.start;
        if (res.items.length < 8 || (provider === "google_cse" && cur.start > 90)) {
          cur.qi = (cur.qi + 1) % queries.length;
          cur.start = provider === "google_cse" ? 1 : 0;
        }
      }

      await writeDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY, JSON.stringify(cur));

      const seenUrl = new Set<string>();
      const candidates: GrowthLeadCandidate[] = [];
      let fetches = 0;

      for (const { hit, searchQuery: qUsed } of hits) {
        if (fetches >= maxFetches) break;
        if (seenUrl.has(hit.link)) continue;
        seenUrl.add(hit.link);

        const html = await discoveryFetchText(hit.link);
        fetches++;
        if (!html) continue;

        const ex = extractFromHtml(hit.link, html);

        const email = ex.emails[0] ?? null;
        const ig = ex.instagramUrls[0] ?? null;
        const fb = ex.facebookUrls[0] ?? null;
        const contactPick =
          pickPrimaryVenueContactUrl(ex.sameHostPaths) ??
          ex.sameHostPaths.find((u) => /contact|book|events|calendar|open|mic/i.test(u)) ??
          null;
        const hasContactPath = Boolean(contactPick);
        const hasSocial = Boolean(ig || fb);

        const om = scoreOpenMicVenueProspect({
          snippet: hit.snippet ?? "",
          pageTextSample: ex.bodyTextSample,
          title: cleanHitTitle(hit.title),
          searchQuery: qUsed,
          hasEmail: Boolean(email),
          hasContactPath,
          hasSocial,
        });

        if (!om.shouldIngest) continue;

        const name = ex.nameGuess.length > 2 ? ex.nameGuess : cleanHitTitle(hit.title);
        const contactQuality = deriveVenueContactQuality({
          email,
          contactUrl: contactPick ?? (hasSocial ? ig || fb : null),
          instagramUrl: ig,
          facebookUrl: fb,
        });

        const yt = ex.youtubeUrls[0] ?? null;
        const tt = ex.tiktokUrls[0] ?? null;

        candidates.push({
          leadType: "VENUE",
          name,
          contactEmailNormalized: email,
          websiteUrl: hit.link.split("#")[0]!,
          contactUrl: contactPick ?? ig ?? fb ?? null,
          instagramUrl: ig,
          youtubeUrl: yt,
          tiktokUrl: tt,
          facebookUrl: fb,
          city: "Chicago",
          region: REGION,
          discoveryMarketSlug: primaryLaunchDiscoveryMarketSlug(),
          source: `${ADAPTER_ID}_crawl`,
          sourceKind: "WEBSITE_CONTACT",
          fitScore: om.fitScore,
          discoveryConfidence: om.confidence,
          performanceTags: om.performanceTags.length ? om.performanceTags : [],
          openMicSignalTier: om.tier,
          contactQuality,
          importKey: hashImport(hit.link),
          internalNotes: `Open-mic–targeted venue discovery. Tier ${om.tier}. Query context: ${qUsed.slice(0, 120)}. Snippet: ${(hit.snippet ?? "").slice(0, 200)}`,
        });
      }

      return candidates;
    },
  };
}
