import sitemap from "@/app/sitemap";
import { siteOrigin } from "@/lib/publicSeo";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_BATCH = 10_000;

export function indexNowApiKey(): string | null {
  const key = process.env.INDEXNOW_API_KEY?.trim();
  return key || null;
}

export function indexNowKeyLocation(): string | null {
  const key = indexNowApiKey();
  if (!key) return null;
  return `${siteOrigin()}/${key}.txt`;
}

/** Collect canonical public URLs from the dynamic sitemap. */
export async function collectSitemapUrls(): Promise<string[]> {
  const entries = await sitemap();
  return [...new Set(entries.map((e) => e.url).filter(Boolean))];
}

/** Bing still accepts sitemap ping; helps discovery on Bing/Copilot. */
export async function pingBingSitemap(sitemapUrl?: string): Promise<{ ok: boolean; status: number }> {
  const url = sitemapUrl ?? `${siteOrigin()}/sitemap.xml`;
  const ping = `https://www.bing.com/ping?sitemap=${encodeURIComponent(url)}`;
  const res = await fetch(ping, { method: "GET", cache: "no-store" });
  return { ok: res.ok, status: res.status };
}

/**
 * IndexNow (Bing, Yandex, Naver, Seznam, etc.). Google does not use IndexNow —
 * keep Search Console sitemap + URL inspection for Google.
 */
export async function submitUrlsToIndexNow(urls: string[]): Promise<{
  ok: boolean;
  status: number;
  submitted: number;
  error?: string;
}> {
  const key = indexNowApiKey();
  const keyLocation = indexNowKeyLocation();
  if (!key || !keyLocation) {
    return { ok: false, status: 0, submitted: 0, error: "INDEXNOW_API_KEY not configured" };
  }

  const host = new URL(siteOrigin()).host;
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  let submitted = 0;
  let lastStatus = 0;

  for (let i = 0; i < unique.length; i += INDEXNOW_BATCH) {
    const batch = unique.slice(i, i + INDEXNOW_BATCH);
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList: batch,
      }),
      cache: "no-store",
    });
    lastStatus = res.status;
    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        submitted,
        error: text.slice(0, 300) || `IndexNow HTTP ${res.status}`,
      };
    }
    submitted += batch.length;
  }

  return { ok: true, status: lastStatus || 200, submitted };
}

export async function runSearchEngineIndexPing(opts?: {
  /** When set, only ping these URLs (e.g. newly published guides). Otherwise full sitemap. */
  urls?: string[];
}): Promise<{
  sitemapUrl: string;
  urlCount: number;
  indexNow: Awaited<ReturnType<typeof submitUrlsToIndexNow>>;
  bing: Awaited<ReturnType<typeof pingBingSitemap>>;
  googleNote: string;
}> {
  const sitemapUrl = `${siteOrigin()}/sitemap.xml`;
  const urls = opts?.urls?.length ? opts.urls : await collectSitemapUrls();
  const [indexNow, bing] = await Promise.all([submitUrlsToIndexNow(urls), pingBingSitemap(sitemapUrl)]);
  return {
    sitemapUrl,
    urlCount: urls.length,
    indexNow,
    bing,
    googleNote:
      "Google deprecated sitemap ping (2023). Use Search Console sitemap + URL inspection; IndexNow covers Bing/Yandex.",
  };
}
