import {
  braveSearchApiKeyForDiscovery,
  braveSearchKeySourceForDiscovery,
  growthDiscoveryHttpDelayMs,
  hasBraveSearch,
  hasSerpApi,
  serpApiKeySourceForDiscovery,
  serpApiKeyForDiscovery,
} from "@/lib/growth/discovery/autonomousConfig";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  disableSerpApiOnQuota429,
  markSerpApiCall,
  readSerpApiProviderState,
  serpApiAvailabilityNow,
} from "@/lib/growth/discovery/providerState";

export type SearchHit = { link: string; title: string; snippet?: string };

/** Active HTTP search backend for nationwide web discovery (cursor + provider pick). */
export type DiscoverySearchProvider = "serpapi" | "brave";

export type WebSearchRunMeta = {
  servedBy: DiscoverySearchProvider;
  rawResultCount: number;
  /** Brave: no more pages (offset 0–9) for this query — caller should rotate query index. */
  bravePaginationExhausted?: boolean;
  /** Why Serp did not return hits this attempt (fallback only). */
  serpSkipReason?: string;
  /** Human-readable chain note for logs. */
  chainNote?: string;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

let lastSearchAt = 0;

async function throttleSearch() {
  const delay = growthDiscoveryHttpDelayMs();
  const now = Date.now();
  const wait = Math.max(0, delay - (now - lastSearchAt));
  if (wait > 0) await sleep(wait);
}

type SerpOrganic = {
  link?: string;
  title?: string;
  snippet?: string;
  redirect_link?: string;
};

type SerpLocalPlace = {
  title?: string;
  link?: string;
  website?: string;
  description?: string;
  links?: { website?: string };
};

type SerpEventResult = {
  title?: string;
  link?: string;
  snippet?: string;
  description?: string;
  venue?: { name?: string; link?: string };
};

function serpLocalPlaceRows(raw: unknown): SerpLocalPlace[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as SerpLocalPlace[];
  if (typeof raw === "object" && raw !== null && "places" in raw) {
    const places = (raw as { places?: unknown }).places;
    if (Array.isArray(places)) return places as SerpLocalPlace[];
  }
  return [];
}

export async function runSerpApiSearch(
  query: string,
  start0Based: number,
  opts?: { prisma?: PrismaClient; marketSlug?: string },
): Promise<{ items: SearchHit[]; rawNextStart: number } | null> {
  if (!hasSerpApi()) {
    console.info("[growth discovery] SerpAPI skipped: no resolved key");
    return null;
  }
  const apiKey = serpApiKeyForDiscovery();
  const keySource = serpApiKeySourceForDiscovery();
  if (!apiKey) {
    console.info("[growth discovery] SerpAPI skipped: resolved key empty", { keySource });
    return null;
  }
  if (opts?.prisma && opts.marketSlug) {
    const avail = await serpApiAvailabilityNow(opts.prisma, opts.marketSlug);
    if (!avail.enabled) {
      console.warn(
        `[growth discovery] SerpAPI NO_REQUEST: ${avail.reason ?? "state_gate"} (market=${opts.marketSlug} callsToday=${avail.state.callsToday} runsToday=${avail.state.runsToday} month=${avail.state.callsMonth} disabledUntil=${avail.state.disabledUntilIso ?? "—"})`,
      );
      return null;
    }
  }
  console.info("[growth discovery] SerpAPI request start", {
    providerChosen: "serpapi" as const,
    keySource: keySource ?? "unknown",
    keyLength: apiKey.length,
    start0Based,
    queryPreview: query.slice(0, 120),
  });
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google");
  u.searchParams.set("q", query);
  u.searchParams.set("start", String(start0Based));
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("num", "10");
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "us");

  await throttleSearch();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    if (opts?.prisma && opts.marketSlug) {
      await markSerpApiCall(opts.prisma, opts.marketSlug);
    }
    const res = await fetch(u.toString(), { signal: ac.signal });
    lastSearchAt = Date.now();
    const text = await res.text();
    if (!res.ok) {
      const tLower = text.toLowerCase();
      const quotaExhausted =
        res.status === 429 &&
        (tLower.includes("run out of searches") ||
          tLower.includes("out of searches") ||
          tLower.includes("quota"));
      if (quotaExhausted && opts?.prisma && opts.marketSlug) {
        const state = await disableSerpApiOnQuota429(opts.prisma, opts.marketSlug, "serpapi_429_quota");
        console.error("[growth discovery] SerpAPI circuit breaker engaged", {
          market: opts.marketSlug,
          disabledUntil: state.disabledUntilIso,
          last429At: state.last429AtIso,
          reason: state.reason,
        });
      }
      console.warn("[growth discovery] SerpAPI HTTP", res.status, text.slice(0, 400));
      return null;
    }
    let data: {
      error?: string;
      search_metadata?: { status?: string };
      organic_results?: SerpOrganic[];
      local_results?: unknown;
      events_results?: unknown;
      answer_box?: { link?: string; title?: string; snippet?: string; answer?: string };
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      console.warn("[growth discovery] SerpAPI invalid JSON", text.slice(0, 200));
      return null;
    }
    if (typeof data.error === "string" && data.error.trim()) {
      console.warn("[growth discovery] SerpAPI error field:", data.error.slice(0, 300));
      return null;
    }
    if (data.search_metadata?.status === "Error") {
      console.warn("[growth discovery] SerpAPI search_metadata.status Error");
      return null;
    }
    const items: SearchHit[] = [];
    const seen = new Set<string>();

    const pushHit = (link: string | undefined, title: string | undefined, snippet?: string) => {
      const L = link?.trim();
      const T = title?.trim();
      if (!L || !T) return;
      const key = L.split("#")[0]!.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ link: L, title: T, snippet: snippet?.trim() });
    };

    for (const it of data.organic_results ?? []) {
      const link = (it.link ?? it.redirect_link)?.trim();
      pushHit(link, it.title?.trim(), it.snippet);
    }

    const ab = data.answer_box;
    if (ab) {
      const snippet = ab.snippet ?? ab.answer;
      pushHit(ab.link?.trim(), ab.title?.trim(), snippet);
    }

    for (const it of serpLocalPlaceRows(data.local_results)) {
      const link = (it.website ?? it.links?.website ?? it.link)?.trim();
      pushHit(link, it.title?.trim(), it.description);
    }

    const evRaw = data.events_results;
    if (Array.isArray(evRaw)) {
      for (const raw of evRaw) {
        const it = raw as SerpEventResult;
        const link = it.link?.trim() || it.venue?.link?.trim();
        const title = it.title?.trim() || it.venue?.name?.trim();
        pushHit(link, title, it.snippet ?? it.description);
      }
    }

    console.info("[growth discovery] SerpAPI response parsed", {
      providerChosen: "serpapi" as const,
      rawResultCount: items.length,
      start0Based,
    });

    return { items, rawNextStart: start0Based + items.length };
  } catch (e) {
    lastSearchAt = Date.now();
    console.warn("[growth discovery] SerpAPI error", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

const BRAVE_MAX_OFFSET = 9;

/**
 * Brave Web Search API — pagination uses `offset` 0–9 (pages) × up to `count` 20 per request.
 * @see https://api.search.brave.com/documentation
 */
export async function runBraveWebSearch(
  query: string,
  pageOffset: number,
  log: { market: string; fallbackReason?: string; afterSerpFailure?: boolean },
): Promise<{
  items: SearchHit[];
  nextOffset: number;
  bravePaginationExhausted: boolean;
} | null> {
  if (!hasBraveSearch()) return null;
  const token = braveSearchApiKeyForDiscovery();
  const keySrc = braveSearchKeySourceForDiscovery();
  if (!token) return null;

  const clamped = Math.min(BRAVE_MAX_OFFSET, Math.max(0, Math.floor(pageOffset)));
  const qPrev = query.replace(/\s+/g, " ").trim().slice(0, 120);

  console.info("[growth discovery] Brave Search API request start", {
    providerChosen: "brave" as const,
    keySource: keySrc ?? "unknown",
    market: log.market,
    offset: clamped,
    queryPreview: qPrev,
    fallbackReason: log.fallbackReason ?? null,
    afterSerpFailure: Boolean(log.afterSerpFailure),
  });

  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("country", "US");
  u.searchParams.set("search_lang", "en");
  u.searchParams.set("count", "20");
  u.searchParams.set("offset", String(clamped));

  await throttleSearch();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(u.toString(), {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": token,
      },
    });
    lastSearchAt = Date.now();
    const text = await res.text();
    if (!res.ok) {
      console.warn(
        `[growth discovery] Brave Search API zero-result reason: http_error status=${res.status} market=${log.market} offset=${clamped} queryPreview="${qPrev}" bodyHead=${text.slice(0, 200)}`,
      );
      return null;
    }
    let data: {
      query?: { more_results_available?: boolean; original?: string };
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      console.warn("[growth discovery] Brave Search API invalid JSON", text.slice(0, 200));
      return null;
    }

    const items: SearchHit[] = [];
    for (const row of data.web?.results ?? []) {
      const link = row.url?.trim() ?? "";
      const titleRaw = row.title?.trim() ?? "";
      const title = titleRaw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const snippet = row.description?.trim();
      if (link && title && /^https?:\/\//i.test(link)) {
        items.push({ link, title, snippet });
      }
    }

    const more = data.query?.more_results_available === true;
    const paginationExhausted = items.length === 0 || !more || clamped >= BRAVE_MAX_OFFSET;
    const nextOffset = paginationExhausted ? 0 : clamped + 1;

    console.info("[growth discovery] Brave Search API response parsed", {
      providerChosen: "brave" as const,
      rawResultCount: items.length,
      offset: clamped,
      moreResultsAvailable: more,
      bravePaginationExhausted: paginationExhausted,
      nextOffset,
    });

    if (items.length === 0) {
      console.warn(
        `[growth discovery] Brave Search API zero-result reason: no_parsed_items market=${log.market} offset=${clamped} queryPreview="${qPrev}"`,
      );
    }

    return { items, nextOffset, bravePaginationExhausted: paginationExhausted };
  } catch (e) {
    lastSearchAt = Date.now();
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[growth discovery] Brave Search API zero-result reason: fetch_exception market=${log.market} offset=${clamped} message=${msg.slice(0, 200)}`,
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function runWebSearch(
  query: string,
  cursor: { provider: DiscoverySearchProvider; start: number },
  opts?: { prisma?: PrismaClient; marketSlug?: string },
): Promise<{
  items: SearchHit[];
  nextCursor: { provider: DiscoverySearchProvider; start: number };
  meta: WebSearchRunMeta;
} | null> {
  const marketTag = opts?.marketSlug ?? "—";
  const qPrev = query.replace(/\s+/g, " ").trim().slice(0, 120);

  if (hasSerpApi()) {
    const serp = await runSerpApiSearch(query, cursor.provider === "serpapi" ? cursor.start : 0, opts);
    if (serp) {
      const next = serp.rawNextStart;
      const exhausted = serp.items.length === 0;
      console.info("[growth discovery] web_search chain: using SerpAPI response", {
        market: marketTag,
        servedBy: "serpapi" as const,
        rawResultCount: serp.items.length,
        chainNote: exhausted ? "serpapi_ok_zero_hits_no_brave_fallback" : "serpapi_primary_ok",
      });
      return {
        items: serp.items,
        nextCursor: { provider: "serpapi", start: exhausted ? 0 : next },
        meta: {
          servedBy: "serpapi",
          rawResultCount: serp.items.length,
          chainNote: exhausted ? "serpapi_ok_zero_hits" : "serpapi_primary_ok",
        },
      };
    }

    const serpReason = "serp_unavailable_blocked_or_http_failure";
    if (hasBraveSearch()) {
      const braveOff = cursor.provider === "brave" ? cursor.start : 0;
      const fb = await runBraveWebSearch(query, braveOff, {
        market: marketTag,
        fallbackReason: serpReason,
        afterSerpFailure: true,
      });
      if (!fb) {
        console.warn(
          `[growth discovery] web_search CHAIN_FAILED: skip_reason=serp_null_then_brave_http_null market=${marketTag} query="${qPrev}"`,
        );
        return null;
      }
      const exhausted = fb.bravePaginationExhausted;
      console.info("[growth discovery] web_search chain: SerpAPI unavailable — using Brave fallback", {
        market: marketTag,
        servedBy: "brave" as const,
        rawResultCount: fb.items.length,
        serpSkipReason: serpReason,
      });
      return {
        items: fb.items,
        nextCursor: { provider: "brave", start: fb.nextOffset },
        meta: {
          servedBy: "brave",
          rawResultCount: fb.items.length,
          bravePaginationExhausted: exhausted,
          serpSkipReason: serpReason,
          chainNote: "serp_null_fallback_brave",
        },
      };
    }

    console.warn(
      `[growth discovery] web_search CHAIN_FAILED: skip_reason=serp_null_no_brave_fallback market=${marketTag} query="${qPrev}"`,
    );
    return null;
  }

  if (hasBraveSearch()) {
    const braveOff = cursor.provider === "brave" ? cursor.start : 0;
    const br = await runBraveWebSearch(query, braveOff, {
      market: marketTag,
      fallbackReason: "no_serpapi_configured",
      afterSerpFailure: false,
    });
    if (!br) {
      console.warn(
        `[growth discovery] web_search SKIPPED: skip_reason=brave_http_failed market=${marketTag} query="${qPrev}" offset=${braveOff}`,
      );
      return null;
    }
    const exhausted = br.bravePaginationExhausted;
    return {
      items: br.items,
      nextCursor: { provider: "brave", start: br.nextOffset },
      meta: {
        servedBy: "brave",
        rawResultCount: br.items.length,
        bravePaginationExhausted: exhausted,
        chainNote: "brave_primary_no_serp",
      },
    };
  }

  console.warn(
    `[growth discovery] web_search SKIPPED: skip_reason=no_serp_or_brave_providers_configured market=${marketTag} query="${qPrev}"`,
  );
  return null;
}

export function discoverySearchProvider(): DiscoverySearchProvider | null {
  if (hasSerpApi()) return "serpapi";
  if (hasBraveSearch()) return "brave";
  return null;
}

export async function discoverySearchProviderForMarket(
  prisma: PrismaClient | null | undefined,
  marketSlug: string,
): Promise<DiscoverySearchProvider | null> {
  if (hasSerpApi() && prisma) {
    const avail = await serpApiAvailabilityNow(prisma, marketSlug, new Date(), { forAdapterRunStart: true });
    if (avail.enabled) return "serpapi";
    console.warn(
      `[growth discovery] provider_pick: SerpAPI gated — ${avail.reason ?? "gate"} (market=${marketSlug}; callsToday=${avail.state.callsToday}; runsToday=${avail.state.runsToday}) → prefer Brave if configured`,
    );
  }
  if (hasBraveSearch()) return "brave";
  if (hasSerpApi()) return "serpapi";
  return null;
}

export async function readSerpApiMetricsForMarket(
  prisma: PrismaClient | null | undefined,
  marketSlug: string,
): Promise<{
  callsToday: number;
  callsMonth: number;
  disabledUntil: string | null;
  last429At: string | null;
  reason: string | null;
}> {
  if (!prisma) {
    return { callsToday: 0, callsMonth: 0, disabledUntil: null, last429At: null, reason: null };
  }
  const s = await readSerpApiProviderState(prisma, marketSlug);
  return {
    callsToday: s.callsToday,
    callsMonth: s.callsMonth,
    disabledUntil: s.disabledUntilIso,
    last429At: s.last429AtIso,
    reason: s.reason,
  };
}
