import { createHash } from "node:crypto";

import {
  growthDiscoveryHostSearchCallsPerRun,
  growthDiscoveryHostSearchEnabled,
  growthDiscoveryHostSearchPageFetchesPerRun,
  hasBraveSearch,
  hasSerpApi,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { inferDiscoveryGeoForNationwideSearch } from "@/lib/growth/discovery/discoveryGeoInference";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractHostOrganizersFromPage } from "@/lib/growth/discovery/hostOrganizerExtraction";
import { serpApiAvailabilityNow } from "@/lib/growth/discovery/providerState";
import { nationwideWebSearchGeoScopes } from "@/lib/growth/discovery/usStateGeoScopes";
import { runWebSearch, type DiscoverySearchProvider, type SearchHit } from "@/lib/growth/discovery/webSearch";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import { isGrowthDiscoveryWebSearchMarket } from "@/lib/growth/marketsConfig";
import { HOST_OUTREACH_CTA_PATH } from "@/lib/growth/hostOutreachSignals";
import { isMineableHostUrl } from "@/lib/growth/hostNameQuality";
import { isDirectoryHost } from "@/lib/growth/outreachTargetIdentity";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";

/**
 * Dedicated HOST/PROMOTER discovery lane.
 *
 * The venue lane asks "where are the open mics"; this lane asks "who runs them". It searches for
 * host intent, crawls the results, and hands each page to `extractHostOrganizersFromPage`, which
 * enforces the same identity rigor the venue lane uses. No Google Places calls: a host is a brand
 * or a person, not a place.
 *
 * Provider spend is deliberately small. The lane never marks a SerpAPI "run start" (that budget
 * belongs to the venue lane), and it only spends Serp calls when today's allocation still leaves a
 * full venue-lane run of headroom; otherwise it falls back to Brave or does nothing.
 */
export const AUTONOMOUS_HOST_SEARCH_ADAPTER_ID = "autonomous_host_search_promoter";

const CURSOR_KEY = "host_search_rotation";

/** Pagination depth per query/geo pair before the vocabulary rotates. */
const MAX_START_PER_QUERY = 20;

/** Host candidates taken from one page, so a single roundup cannot flood a run. */
const MAX_HOSTS_PER_PAGE = 3;

/** Host-intent query cores. Geo tail is appended per rotation. */
const HOST_QUERY_CORES = [
  'open mic "hosted by"',
  '"open mic" "your host"',
  '"open mic" host producer',
  '"open mic" "presented by"',
  '"open mic" "produced by"',
  '"comedy open mic" producer',
  '"comedy open mic" "hosted by"',
  '"poetry open mic" "hosted by"',
  '"open mic" collective organizer',
  '"open mic" series organizer',
  '"presents" open mic night',
  '"an open mic production"',
  '"open mic" comedy productions',
  '"we host" open mic venues',
  '"open mic" host multiple venues',
  '"open mic" "every" host residency',
];

type HostSearchCursor = {
  qi: number;
  start: number;
  prov: DiscoverySearchProvider;
};

function parseCursor(raw: string | null, prov: DiscoverySearchProvider): HostSearchCursor {
  if (!raw) return { qi: 0, start: 0, prov };
  try {
    const j = JSON.parse(raw) as Partial<HostSearchCursor>;
    return {
      qi: Number.isFinite(j.qi) ? Number(j.qi) : 0,
      start: Number.isFinite(j.start) ? Number(j.start) : 0,
      prov: j.prov === "serpapi" || j.prov === "brave" ? j.prov : prov,
    };
  } catch {
    return { qi: 0, start: 0, prov };
  }
}

function buildHostQuery(qi: number, geoScopes: string[]): string {
  const core = HOST_QUERY_CORES[qi % HOST_QUERY_CORES.length]!;
  const geo = geoScopes[Math.floor(qi / HOST_QUERY_CORES.length) % geoScopes.length]!;
  return `${core}${geo ? ` ${geo}` : ""}`.replace(/\s+/g, " ").trim();
}

function hashImport(value: string): string {
  const h = createHash("sha256").update(`${AUTONOMOUS_HOST_SEARCH_ADAPTER_ID}|${value}`).digest("hex").slice(0, 24);
  return `auto:host:${h}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Pages worth fetching for host intent. Social/video results carry no minable identity. */
function allowHostHitUrl(url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  if (h.includes("google.") || h === "gstatic.com") return false;
  if (/(^|\.)(tiktok|youtube|youtu|linkedin|reddit|pinterest|twitter|x)\.[a-z.]+$/i.test(h)) return false;
  return true;
}

/**
 * SerpAPI/Brave budget decision for the host lane.
 *
 * Returns the number of Serp calls the lane may make. Zero means "use Brave if configured,
 * otherwise skip" — the circuit breaker and daily/monthly caps inside `runSerpApiSearch` still
 * apply to every call we do make.
 */
export function hostLaneSerpCallAllowance(input: {
  requested: number;
  callsToday: number;
  dailyAllocation: number | null;
  /** Calls the venue lane needs later in this same run. */
  venueLaneReserve: number;
}): number {
  const alloc = input.dailyAllocation ?? 0;
  if (alloc <= 0) return 0;
  const headroom = alloc - Math.max(0, input.callsToday) - Math.max(0, input.venueLaneReserve);
  if (headroom <= 0) return 0;
  return Math.max(0, Math.min(input.requested, headroom));
}

export function createAutonomousHostSearchAdapter(): GrowthLeadSourceAdapter {
  return {
    id: AUTONOMOUS_HOST_SEARCH_ADAPTER_ID,
    leadType: "PROMOTER_ACCOUNT",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      try {
        if (!growthDiscoveryHostSearchEnabled()) return [];
        if (!isGrowthDiscoveryWebSearchMarket(ctx.discoveryMarketSlug)) return [];
        if (!ctx.prisma) return [];

        const prisma = ctx.prisma;
        const requestedCalls = growthDiscoveryHostSearchCallsPerRun();
        const maxFetches = growthDiscoveryHostSearchPageFetchesPerRun();

        /**
         * Provider pick without `forAdapterRunStart`: the run-frequency cap protects the venue
         * lane's cadence, and the host lane must not consume one of its run slots.
         */
        let provider: DiscoverySearchProvider | null = null;
        let serpAllowance = 0;
        if (hasSerpApi()) {
          const avail = await serpApiAvailabilityNow(prisma, ctx.discoveryMarketSlug);
          if (avail.enabled) {
            serpAllowance = hostLaneSerpCallAllowance({
              requested: requestedCalls,
              callsToday: avail.state.callsToday,
              dailyAllocation: avail.state.dailyAllocation,
              venueLaneReserve: growthDiscoveryHostSearchCallsPerRun() * 4,
            });
            if (serpAllowance > 0) provider = "serpapi";
          }
          if (!provider) {
            console.info(
              `[growth discovery] ${AUTONOMOUS_HOST_SEARCH_ADAPTER_ID} not using SerpAPI: ${
                avail.enabled ? "no_headroom_after_venue_reserve" : avail.reason ?? "gated"
              }`,
            );
          }
        }
        if (!provider && hasBraveSearch()) provider = "brave";
        if (!provider) return [];

        const searchCalls = provider === "serpapi" ? serpAllowance : requestedCalls;
        const geoScopes = nationwideWebSearchGeoScopes();
        const rotationSpan = Math.max(1, HOST_QUERY_CORES.length * geoScopes.length);
        let cur = parseCursor(
          await readDiscoveryCursor(prisma, AUTONOMOUS_HOST_SEARCH_ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY),
          provider,
        );
        if (cur.prov !== provider) cur = { qi: cur.qi, start: 0, prov: provider };

        const hits: { hit: SearchHit; query: string }[] = [];
        for (let i = 0; i < searchCalls; i++) {
          const q = buildHostQuery(cur.qi, geoScopes);
          const res = await runWebSearch(
            q,
            { provider: cur.prov, start: cur.start },
            { prisma, marketSlug: ctx.discoveryMarketSlug },
          );
          if (!res || res.items.length === 0) {
            cur.qi = (cur.qi + 1) % rotationSpan;
            cur.start = 0;
            continue;
          }
          for (const it of res.items) {
            if (!allowHostHitUrl(it.link)) continue;
            hits.push({ hit: it, query: q });
          }
          cur.prov = res.nextCursor.provider;
          cur.start = res.nextCursor.start;
          if (res.meta.bravePaginationExhausted || cur.start >= MAX_START_PER_QUERY || res.items.length < 8) {
            cur.qi = (cur.qi + 1) % rotationSpan;
            cur.start = 0;
          }
        }
        await writeDiscoveryCursor(
          prisma,
          AUTONOMOUS_HOST_SEARCH_ADAPTER_ID,
          ctx.discoveryMarketSlug,
          CURSOR_KEY,
          JSON.stringify(cur),
        );

        const out: GrowthLeadCandidate[] = [];
        const seenUrl = new Set<string>();
        const seenHostKey = new Set<string>();
        let fetches = 0;
        let pagesWithoutEvidence = 0;
        let rejectedNames = 0;
        let hostsWithoutMineableUrl = 0;

        for (const { hit, query } of hits) {
          if (fetches >= maxFetches) break;
          const pageUrl = hit.link.split("#")[0]!;
          if (seenUrl.has(pageUrl)) continue;
          seenUrl.add(pageUrl);

          const html = await discoveryFetchText(pageUrl);
          fetches++;
          if (!html) continue;

          const extraction = extractHostOrganizersFromPage({
            pageUrl,
            html,
            maxCandidates: MAX_HOSTS_PER_PAGE,
          });
          if (!extraction.hasOpenMicEvidence) {
            pagesWithoutEvidence++;
            continue;
          }
          rejectedNames += extraction.rejected.length;

          const geo = inferDiscoveryGeoForNationwideSearch({
            title: hit.title,
            snippet: hit.snippet ?? "",
            searchQuery: query,
            pageUrl,
          });
          const pageIsFirstParty = !isDirectoryHost(hostOf(pageUrl));

          for (const cand of extraction.candidates) {
            /**
             * The host's own site: the link the page gave for this host, or the page itself when
             * the page is the host's own (a search hit on a producer's site).
             */
            const hostUrl =
              (isMineableHostUrl(cand.websiteUrl) ? cand.websiteUrl : null) ??
              (pageIsFirstParty && isMineableHostUrl(pageUrl) ? pageUrl : null);
            if (!hostUrl) {
              hostsWithoutMineableUrl++;
              continue;
            }
            const dedupeKey = `${cand.name.toLowerCase()}|${hostOf(hostUrl) ?? ""}`;
            if (seenHostKey.has(dedupeKey)) continue;
            seenHostKey.add(dedupeKey);

            out.push({
              leadType: "PROMOTER_ACCOUNT",
              name: cand.name,
              contactEmailNormalized: cand.email,
              websiteUrl: hostUrl,
              city: geo.city,
              region: geo.region,
              discoveryMarketSlug: geo.discoveryMarketSlug,
              source: AUTONOMOUS_HOST_SEARCH_ADAPTER_ID,
              sourceKind: "EVENT_LISTING",
              fitScore: cand.confidence >= 75 ? 7 : 6,
              discoveryConfidence: cand.confidence,
              openMicSignalTier: "EXPLICIT_OPEN_MIC",
              importKey: hashImport(dedupeKey),
              internalNotes: `Host lane: identity via ${cand.method} on ${pageUrl}${
                extraction.recurrence ? ` (recurring: ${extraction.recurrence})` : ""
              }. Query: ${query.slice(0, 140)}. Snippet: ${cand.evidenceSnippet.slice(0, 200)}.`,
              discoveryHints: {
                hostOutreachLane: true,
                hostBrand: cand.name,
                hostCtaPath: HOST_OUTREACH_CTA_PATH,
                hostIdentityMethod: cand.method,
                hostIdentityConfidence: cand.confidence,
                hostEvidenceSourceUrl: pageUrl,
                hostRecurrence: extraction.recurrence,
                evidenceSnippet: cand.evidenceSnippet,
                source: AUTONOMOUS_HOST_SEARCH_ADAPTER_ID,
                extractedFrom: {
                  sourceUrl: pageUrl,
                  method: cand.method,
                  pageRole: pageIsFirstParty ? "first_party_host" : "directory_or_article",
                },
              },
            });
          }
        }

        console.info(`[growth discovery] ${AUTONOMOUS_HOST_SEARCH_ADAPTER_ID} host identity funnel`, {
          market: ctx.discoveryMarketSlug,
          provider,
          searchCalls,
          serpAllowance,
          hits: hits.length,
          pagesCrawled: fetches,
          pagesWithoutEvidence,
          rejectedNames,
          hostsWithoutMineableUrl,
          candidatesEmitted: out.length,
        });
        return out;
      } catch (e) {
        console.error(`[growth discovery] ${AUTONOMOUS_HOST_SEARCH_ADAPTER_ID} fatal error`, {
          market: ctx.discoveryMarketSlug,
          reason: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
        });
        return [];
      }
    },
  };
}
