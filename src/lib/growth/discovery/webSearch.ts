import {
  growthDiscoveryHttpDelayMs,
  hasGoogleProgrammableSearch,
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

export async function runProgrammableSearch(
  query: string,
  start1Based: number,
): Promise<{ items: SearchHit[]; rawNextStart: number } | null> {
  if (!hasGoogleProgrammableSearch()) return null;
  const key = process.env.GROWTH_GOOGLE_CSE_API_KEY!.trim();
  const cx = process.env.GROWTH_GOOGLE_CSE_CX!.trim();
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", query);
  u.searchParams.set("start", String(start1Based));

  await throttleSearch();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(u.toString(), { signal: ac.signal });
    lastSearchAt = Date.now();
    if (!res.ok) {
      console.warn("[growth discovery] Google CSE HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      items?: { link?: string; title?: string; snippet?: string }[];
      searchInformation?: { totalResults?: string };
    };
    const items: SearchHit[] = [];
    for (const it of data.items ?? []) {
      if (it.link && it.title) items.push({ link: it.link, title: it.title, snippet: it.snippet });
    }
    const next = start1Based + items.length;
    return { items, rawNextStart: next };
  } catch (e) {
    lastSearchAt = Date.now();
    console.warn("[growth discovery] Google CSE error", e);
    return null;
  } finally {
    clearTimeout(t);
  }
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

    return { items, rawNextStart: start0Based + items.length };
  } catch (e) {
    lastSearchAt = Date.now();
    console.warn("[growth discovery] SerpAPI error", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function runWebSearch(
  query: string,
  cursor: { provider: "google_cse" | "serpapi"; start: number },
  opts?: { prisma?: PrismaClient; marketSlug?: string },
): Promise<{ items: SearchHit[]; nextCursor: { provider: "google_cse" | "serpapi"; start: number } } | null> {
  if (hasSerpApi()) {
    const r = await runSerpApiSearch(query, cursor.provider === "serpapi" ? cursor.start : 0, opts);
    if (r) {
      const next = r.rawNextStart;
      const exhausted = r.items.length === 0;
      return {
        items: r.items,
        nextCursor: { provider: "serpapi", start: exhausted ? 0 : next },
      };
    }
    if (hasGoogleProgrammableSearch()) {
      const fallback = await runProgrammableSearch(query, 1);
      if (!fallback) return null;
      const exhausted = fallback.items.length === 0 || fallback.rawNextStart > 81;
      return {
        items: fallback.items,
        nextCursor: { provider: "google_cse", start: exhausted ? 1 : fallback.rawNextStart },
      };
    }
    return null;
  }
  if (hasGoogleProgrammableSearch()) {
    const start1 = cursor.provider === "google_cse" ? Math.max(1, cursor.start || 1) : 1;
    const r = await runProgrammableSearch(query, start1);
    if (!r) return null;
    const exhausted = r.items.length === 0 || start1 > 81;
    return {
      items: r.items,
      nextCursor: { provider: "google_cse", start: exhausted ? 1 : r.rawNextStart },
    };
  }
  return null;
}

export function discoverySearchProvider(): "serpapi" | "google_cse" | null {
  if (hasSerpApi()) return "serpapi";
  if (hasGoogleProgrammableSearch()) return "google_cse";
  return null;
}

export async function discoverySearchProviderForMarket(
  prisma: PrismaClient | null | undefined,
  marketSlug: string,
): Promise<"serpapi" | "google_cse" | null> {
  if (hasSerpApi() && prisma) {
    const avail = await serpApiAvailabilityNow(prisma, marketSlug, new Date(), { forAdapterRunStart: true });
    if (avail.enabled) return "serpapi";
    console.warn(
      `[growth discovery] SerpAPI NO_REQUEST: ${avail.reason ?? "gate"} (market=${marketSlug} provider_pick; callsToday=${avail.state.callsToday} runsToday=${avail.state.runsToday})`,
    );
  }
  if (hasGoogleProgrammableSearch()) return "google_cse";
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
