import { createHash } from "node:crypto";
import type { GrowthLeadType } from "@/generated/prisma/client";
import { CHICAGOLAND_SLUG } from "@/lib/growth/data/chicagolandDiscoverySeeds";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryAutonomousMaxPageFetchesPerRun,
  growthDiscoveryAutonomousSearchCallsPerRun,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml } from "@/lib/growth/discovery/extractFromHtml";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { discoverySearchProvider, runWebSearch, type SearchHit } from "@/lib/growth/discovery/webSearch";

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

function hashImport(adapterId: string, url: string): string {
  const h = createHash("sha256").update(`${adapterId}|${url}`).digest("hex").slice(0, 24);
  return `auto:${adapterId}:${h}`;
}

function allowHitUrl(url: string, leadType: GrowthLeadType): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h.includes("google.") || h === "gstatic.com") return false;
    if (leadType !== "ARTIST") {
      if (h.includes("instagram.com") || h.includes("tiktok.com")) return false;
    }
    if (h.includes("facebook.com") || h.includes("fb.com")) return false;
    if (leadType !== "ARTIST" && (h.includes("youtube.com") || h.includes("youtu.be"))) return false;
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

const VENUE_QUERIES = [
  "Chicago IL live music venue book a show contact",
  "open mic night Chicago Illinois venue",
  "Chicago comedy club book talent contact",
  "Wicker Park Logan Square Chicago music venue events",
  "Evanston Skokie IL live music venue",
  "Berwyn Oak Park IL concert venue booking",
  "Chicago IL private event venue live entertainment",
  "Chicago rooftop bar live music booking",
  "Chicago IL jazz club calendar contact",
  "Chicago IL acoustic showcase venue",
];

const ARTIST_QUERIES = [
  "Chicago singer songwriter booking contact",
  "Chicago IL band for hire wedding corporate",
  "Chicago musician instagram portfolio",
  "Chicagoland cover band booking",
  "Chicago IL hip hop artist booking email",
  "Chicago folk artist listen booking",
  "Chicago blues musician hire",
  "Chicago IL wedding band contact",
  "Naperville Aurora IL musician booking",
];

const PROMOTER_QUERIES = [
  "Chicago event promoter live music",
  "Chicago IL talent buyer booking agency",
  "Chicago concert promoter contact",
  "Chicagoland music festival organizer",
  "Chicago IL booking agent live entertainment",
  "Chicago corporate event entertainment agency",
];

function queriesFor(leadType: GrowthLeadType): string[] {
  if (leadType === "VENUE") return VENUE_QUERIES;
  if (leadType === "ARTIST") return ARTIST_QUERIES;
  return PROMOTER_QUERIES;
}

function adapterIdFor(leadType: GrowthLeadType): string {
  if (leadType === "VENUE") return "autonomous_web_search_venue";
  if (leadType === "ARTIST") return "autonomous_web_search_artist";
  return "autonomous_web_search_promoter";
}

export function createAutonomousWebSearchAdapter(leadType: GrowthLeadType): GrowthLeadSourceAdapter {
  const id = adapterIdFor(leadType);
  return {
    id,
    leadType,
    async discover(ctx: GrowthLeadDiscoveryContext) {
      if (!growthDiscoveryAutonomousEnabled()) return [];
      if (ctx.discoveryMarketSlug.trim().toLowerCase() !== CHICAGOLAND_SLUG) return [];
      const provider = discoverySearchProvider();
      if (!provider || !ctx.prisma) return [];

      const prisma = ctx.prisma;
      const searchCalls = growthDiscoveryAutonomousSearchCallsPerRun();
      const maxFetches = growthDiscoveryAutonomousMaxPageFetchesPerRun();
      const queries = queriesFor(leadType);

      let cur = parseCursor(await readDiscoveryCursor(prisma, id, ctx.discoveryMarketSlug, CURSOR_KEY), provider);
      if (cur.prov !== provider) {
        cur = { qi: cur.qi, start: provider === "google_cse" ? 1 : 0, prov: provider };
      }

      const hits: SearchHit[] = [];
      for (let i = 0; i < searchCalls; i++) {
        const q = queries[cur.qi % queries.length]!;
        const res = await runWebSearch(q, { provider: cur.prov, start: cur.start });
        if (!res || res.items.length === 0) {
          cur.qi = (cur.qi + 1) % queries.length;
          cur.start = provider === "google_cse" ? 1 : 0;
          continue;
        }
        for (const it of res.items) {
          if (allowHitUrl(it.link, leadType)) hits.push(it);
        }
        cur.start = res.nextCursor.start;
        if (res.items.length < 8 || (provider === "google_cse" && cur.start > 90)) {
          cur.qi = (cur.qi + 1) % queries.length;
          cur.start = provider === "google_cse" ? 1 : 0;
        }
      }

      await writeDiscoveryCursor(prisma, id, ctx.discoveryMarketSlug, CURSOR_KEY, JSON.stringify(cur));

      const seenUrl = new Set<string>();
      const candidates: GrowthLeadCandidate[] = [];
      let fetches = 0;

      for (const hit of hits) {
        if (fetches >= maxFetches) break;
        if (seenUrl.has(hit.link)) continue;
        seenUrl.add(hit.link);

        const html = await discoveryFetchText(hit.link);
        fetches++;
        if (!html) continue;

        const ex = extractFromHtml(hit.link, html);
        const name = ex.nameGuess.length > 2 ? ex.nameGuess : cleanHitTitle(hit.title);
        const email = ex.emails[0] ?? null;
        const ig = ex.instagramUrls[0] ?? null;
        const yt = ex.youtubeUrls[0] ?? null;
        const tt = ex.tiktokUrls[0] ?? null;

        candidates.push({
          leadType,
          name,
          contactEmailNormalized: email,
          websiteUrl: hit.link.split("#")[0]!,
          contactUrl: ex.sameHostPaths.find((u) => /contact|book|about/i.test(u)) ?? null,
          instagramUrl: ig,
          youtubeUrl: yt,
          tiktokUrl: tt,
          city: "Chicago",
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: `${id}_crawl`,
          sourceKind: "WEBSITE_CONTACT",
          fitScore: email ? 6 : ig ? 5 : 4,
          discoveryConfidence: email ? 55 : ig ? 48 : 38,
          importKey: hashImport(id, hit.link),
          internalNotes: `Autonomous web search hit. Query rotation + HTML extract. Snippet: ${(hit.snippet ?? "").slice(0, 280)}`,
        });
      }

      return candidates;
    },
  };
}
