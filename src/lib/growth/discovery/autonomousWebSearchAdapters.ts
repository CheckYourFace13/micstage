import { createHash } from "node:crypto";
import { isNationalDiscoveryMarket } from "@/lib/growth/marketsConfig";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryAutonomousMaxPageFetchesPerRun,
  growthDiscoveryAutonomousSearchCallsPerRun,
  growthDiscoveryAutonomousWebSearchEnabled,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { inferDiscoveryGeoForNationwideSearch } from "@/lib/growth/discovery/discoveryGeoInference";
import {
  extractFromHtml,
  pickPrimaryVenueContactUrl,
  rankVenueInternalUrls,
} from "@/lib/growth/discovery/extractFromHtml";
import { scoreOpenMicVenueProspect } from "@/lib/growth/discovery/venueOpenMicSignals";
import { pickPrimaryVenueOutreachEmail } from "@/lib/growth/discovery/venueEmailExtraction";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { deriveVenueContactQuality } from "@/lib/growth/venueContactQuality";
import {
  discoverySearchProviderForMarket,
  runWebSearch,
  type SearchHit,
} from "@/lib/growth/discovery/webSearch";
import { markSerpApiRunStarted } from "@/lib/growth/discovery/providerState";

const ADAPTER_ID = "autonomous_web_search_venue";
const CURSOR_KEY = "search_rotation";

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

function resolveOutboundUrlFromSearchHit(raw: string, depth = 0): string | null {
  if (depth > 5) return null;
  try {
    const noHash = raw.trim().split("#")[0]!;
    if (!/^https?:\/\//i.test(noHash)) return null;
    const u = new URL(noHash);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const isGoogleHost = host === "google.com" || host.endsWith(".google.com");
    if (isGoogleHost && (u.pathname === "/url" || u.pathname.startsWith("/url/"))) {
      const innerRaw =
        u.searchParams.get("url") || u.searchParams.get("q") || u.searchParams.get("rurl") || "";
      if (!innerRaw.trim()) return null;
      let inner = innerRaw.trim();
      try {
        inner = decodeURIComponent(inner);
      } catch {
        /* use as-is */
      }
      if (/^https?:\/\//i.test(inner)) {
        return resolveOutboundUrlFromSearchHit(inner, depth + 1);
      }
      return null;
    }
    return noHash;
  } catch {
    return null;
  }
}

function allowHitUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h.includes("google.") || h === "gstatic.com") return false;
    if (h.includes("tiktok.com")) return false;
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

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Open-mic–intent query cores (geo tail appended per rotation). */
const OPEN_MIC_QUERY_CORES = [
  '"open mic" night venue bar OR coffeehouse',
  '"open mic" venue United States',
  '"open mic night" live music venue',
  '"acoustic open mic" venue',
  '"comedy open mic" club OR venue',
  '"poetry open mic" venue OR cafe',
  '"jam night" live music venue bar',
  '"songwriter open mic" OR "singer songwriter night" venue',
  '"mic night" open stage venue',
  '"open stage" OR "amateur night" music venue',
  '"open mic" events calendar venue',
  "recurring weekly open mic night venue",
  'site:eventbrite.com "open mic" United States',
  'site:meetup.com "open mic" United States',
  'site:facebook.com/events "open mic"',
  'site:openmikes.org United States',
  'site:badslava.com "open mic"',
  '"open mic" brewery OR taproom',
  '"open mic" listening room OR lounge',
];

/** Rotating metro/state tails so results are not Chicagoland-only. */
const GEO_SCOPES = [
  "",
  "Nashville TN",
  "Austin TX",
  "Portland OR",
  "Los Angeles CA",
  "Denver CO",
  "Seattle WA",
  "Boston MA",
  "Atlanta GA",
  "New Orleans LA",
  "Phoenix AZ",
  "Philadelphia PA",
  "Detroit MI",
  "Minneapolis MN",
  "Kansas City MO",
  "San Diego CA",
  "Miami FL",
  "Washington DC",
  "Dallas TX",
  "Houston TX",
  "Chicago IL",
  "St Louis MO",
  "Charlotte NC",
  "Columbus OH",
  "Indianapolis IN",
  "Las Vegas NV",
];

function buildSearchQuery(cursorQi: number): string {
  const core = OPEN_MIC_QUERY_CORES[cursorQi % OPEN_MIC_QUERY_CORES.length]!;
  const geo = GEO_SCOPES[Math.floor(cursorQi / OPEN_MIC_QUERY_CORES.length) % GEO_SCOPES.length]!;
  const q = geo ? `${core} ${geo}` : core;
  return q.replace(/\s+/g, " ").trim();
}

const DEEP_PAGES_PER_HIT = 5;

/**
 * SerpAPI / Google CSE → nationwide open-mic venue queries → multi-page fetch → aggressive email extraction.
 * Runs only when the cron market slug is `national-discovery-us` (see `growthDiscoveryMarketSlugs()` default).
 */
export function createAutonomousVenueWebSearchAdapter(): GrowthLeadSourceAdapter {
  return {
    id: ADAPTER_ID,
    leadType: "VENUE",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      try {
        if (!growthDiscoveryAutonomousWebSearchEnabled()) {
          console.info("[growth discovery] autonomous_web_search_venue skipped: web-search gate disabled", {
            market: ctx.discoveryMarketSlug,
            autonomousEnabled: growthDiscoveryAutonomousEnabled(),
          });
          return [];
        }
        if (!isNationalDiscoveryMarket(ctx.discoveryMarketSlug)) {
          console.info("[growth discovery] autonomous_web_search_venue skipped: not national discovery lane", {
            market: ctx.discoveryMarketSlug,
            expected: "national-discovery-us",
          });
          return [];
        }
        const provider = await discoverySearchProviderForMarket(ctx.prisma, ctx.discoveryMarketSlug);
        if (!provider || !ctx.prisma) {
          console.info("[growth discovery] autonomous_web_search_venue skipped: provider/prisma missing", {
            provider,
            hasPrisma: Boolean(ctx.prisma),
            market: ctx.discoveryMarketSlug,
          });
          return [];
        }

        const prisma = ctx.prisma;
        if (provider === "serpapi") {
          await markSerpApiRunStarted(prisma, ctx.discoveryMarketSlug);
        }
        const mult = Math.max(0.02, ctx.autonomousWebSearchBudgetMultiplier ?? 1);
        const searchCalls = Math.max(1, Math.round(growthDiscoveryAutonomousSearchCallsPerRun() * mult));
        const maxFetches = Math.max(2, Math.round(growthDiscoveryAutonomousMaxPageFetchesPerRun() * mult));

        let cur = parseCursor(await readDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY), provider);
        if (cur.prov !== provider) {
          cur = { qi: cur.qi, start: provider === "google_cse" ? 1 : 0, prov: provider };
        }

        type TaggedHit = { hit: SearchHit; searchQuery: string };
        const hits: TaggedHit[] = [];
        console.info("[growth discovery] autonomous_web_search_venue run start (nationwide)", {
          provider,
          market: ctx.discoveryMarketSlug,
          searchCalls,
          maxFetches,
        });
        for (let i = 0; i < searchCalls; i++) {
          const q = buildSearchQuery(cur.qi);
          const res = await runWebSearch(
            q,
            { provider: cur.prov, start: cur.start },
            { prisma, marketSlug: ctx.discoveryMarketSlug },
          );
          if (!res || res.items.length === 0) {
            cur.qi = (cur.qi + 1) % (OPEN_MIC_QUERY_CORES.length * GEO_SCOPES.length);
            cur.start = cur.prov === "google_cse" ? 1 : 0;
            continue;
          }
          for (const it of res.items) {
            const resolved = resolveOutboundUrlFromSearchHit(it.link);
            if (!resolved || !allowHitUrl(resolved)) continue;
            hits.push({ hit: { ...it, link: resolved }, searchQuery: q });
          }
          cur.prov = res.nextCursor.provider;
          cur.start = res.nextCursor.start;
          if (res.items.length < 8 || (cur.prov === "google_cse" && cur.start > 90)) {
            cur.qi = (cur.qi + 1) % (OPEN_MIC_QUERY_CORES.length * GEO_SCOPES.length);
            cur.start = cur.prov === "google_cse" ? 1 : 0;
          }
        }

        await writeDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY, JSON.stringify(cur));
        console.info("[growth discovery] autonomous_web_search_venue search phase done", {
          provider,
          hitCount: hits.length,
        });

        const seenUrl = new Set<string>();
        const candidates: GrowthLeadCandidate[] = [];
        let fetches = 0;

        for (const { hit, searchQuery: qUsed } of hits) {
          if (fetches >= maxFetches) break;
          const pageUrl = hit.link.split("#")[0]!;
          if (seenUrl.has(pageUrl)) continue;
          seenUrl.add(pageUrl);

          const html = await discoveryFetchText(pageUrl);
          fetches++;

          const pageHost = hostOf(pageUrl);
          const emptyEx = {
            nameGuess: "",
            emailsTagged: [] as { email: string; source: "mailto" | "body" | "header_footer" | "secondary_page" }[],
            emails: [] as string[],
            instagramUrls: [] as string[],
            youtubeUrls: [] as string[],
            tiktokUrls: [] as string[],
            facebookUrls: [] as string[],
            sameHostPaths: [] as string[],
            bodyTextSample: "",
          };
          let ex = html ? extractFromHtml(pageUrl, html) : emptyEx;
          const emailsTagged = [...ex.emailsTagged];

          const allPaths = new Set<string>(ex.sameHostPaths);
          const bodyPieces = [ex.bodyTextSample];

          if (html) {
            const ranked = rankVenueInternalUrls(ex.sameHostPaths).filter((u) => {
              try {
                return new URL(u).href.split("#")[0] !== new URL(pageUrl).href.split("#")[0];
              } catch {
                return u !== pageUrl;
              }
            });
            let deep = 0;
            for (const subUrl of ranked) {
              if (fetches >= maxFetches || deep >= DEEP_PAGES_PER_HIT) break;
              const subHtml = await discoveryFetchText(subUrl);
              fetches++;
              deep++;
              if (!subHtml) continue;
              const subEx = extractFromHtml(subUrl, subHtml, { maxSameHostLinks: 32 });
              for (const t of subEx.emailsTagged) {
                emailsTagged.push({ email: t.email, source: "secondary_page" });
              }
              for (const p of subEx.sameHostPaths) allPaths.add(p);
              bodyPieces.push(subEx.bodyTextSample.slice(0, 7000));
              ex = {
                ...ex,
                instagramUrls: [...new Set([...ex.instagramUrls, ...subEx.instagramUrls])],
                youtubeUrls: [...new Set([...ex.youtubeUrls, ...subEx.youtubeUrls])],
                tiktokUrls: [...new Set([...ex.tiktokUrls, ...subEx.tiktokUrls])],
                facebookUrls: [...new Set([...ex.facebookUrls, ...subEx.facebookUrls])],
              };
            }
          }

          const picked = pickPrimaryVenueOutreachEmail(emailsTagged, pageHost);
          const email = picked.primary;
          const additionalContactEmails = picked.additional;
          const totalFound = (email ? 1 : 0) + additionalContactEmails.length;

          const ig = ex.instagramUrls[0] ?? null;
          const fb = ex.facebookUrls[0] ?? null;
          const contactPick =
            pickPrimaryVenueContactUrl([...allPaths]) ??
            [...allPaths].find((u) => /contact|book|events|calendar|open|mic/i.test(u)) ??
            null;

          const bodySample = bodyPieces.join("\n").slice(0, 24_000);
          const nameGuess = ex.nameGuess;
          const yt = ex.youtubeUrls[0] ?? null;
          const tt = ex.tiktokUrls[0] ?? null;

          const hasContactPath = Boolean(contactPick);
          const hasSocial = Boolean(ig || fb);

          const om = scoreOpenMicVenueProspect({
            snippet: hit.snippet ?? "",
            pageTextSample: bodySample,
            title: cleanHitTitle(hit.title),
            searchQuery: qUsed,
            hasEmail: Boolean(email),
            hasContactPath,
            hasSocial,
          });

          if (!om.shouldIngest) continue;

          const name = nameGuess.length > 2 ? nameGuess : cleanHitTitle(hit.title);
          const contactQuality = deriveVenueContactQuality({
            email,
            contactUrl: contactPick ?? (hasSocial ? ig || fb : null),
            instagramUrl: ig,
            facebookUrl: fb,
          });

          const geo = inferDiscoveryGeoForNationwideSearch({
            title: cleanHitTitle(hit.title),
            snippet: hit.snippet ?? "",
            searchQuery: qUsed,
            pageUrl,
          });

          const fetchNote = html ? "" : " Page fetch failed or non-HTML; scored from SERP only.";
          const multiNote = additionalContactEmails.length > 0 ? " multi=true" : "";
          const emailMeta = `[micstage_email_meta] count=${totalFound} primary_src=${picked.bestSource}${multiNote}`;

          candidates.push({
            leadType: "VENUE",
            name,
            contactEmailNormalized: email,
            emailExtractedFromNoisyText: true,
            additionalContactEmails,
            websiteUrl: pageUrl,
            contactUrl: contactPick ?? ig ?? fb ?? null,
            instagramUrl: ig,
            youtubeUrl: yt,
            tiktokUrl: tt,
            facebookUrl: fb,
            city: geo.city,
            region: geo.region,
            discoveryMarketSlug: geo.discoveryMarketSlug,
            source: `${ADAPTER_ID}_crawl`,
            sourceKind: "WEBSITE_CONTACT",
            fitScore: om.fitScore,
            discoveryConfidence: om.confidence,
            performanceTags: om.performanceTags.length ? om.performanceTags : [],
            openMicSignalTier: om.tier,
            contactQuality,
            importKey: hashImport(pageUrl),
            internalNotes: `${emailMeta}. Open-mic–targeted nationwide discovery. Tier ${om.tier}. Market ${geo.discoveryMarketSlug}. Query: ${qUsed.slice(0, 140)}. Snippet: ${(hit.snippet ?? "").slice(0, 200)}.${fetchNote}`,
          });
        }

        console.info("[growth discovery] autonomous_web_search_venue emit", {
          provider,
          candidates: candidates.length,
        });
        return candidates;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[growth discovery] autonomous_web_search_venue fatal error", {
          market: ctx.discoveryMarketSlug,
          reason: message.slice(0, 400),
        });
        return [];
      }
    },
  };
}
