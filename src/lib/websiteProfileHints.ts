import { assertImportableHttpUrl } from "@/lib/publicHttpUrl";

export type WebsiteSocialHints = {
  facebookUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  soundcloudUrl: string | null;
};

export type WebsiteProfileHintsResult = {
  sourceUrl: string;
  suggestedSiteName: string | null;
  suggestedDescription: string | null;
  socials: WebsiteSocialHints;
  logoCandidates: string[];
  imageCandidates: string[];
};

const FETCH_HEADERS = {
  "User-Agent": "MicStageWebsiteImport/1.0 (+https://micstage.com)",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

function firstMatchingLink(links: string[], patterns: RegExp[]): string | null {
  for (const l of links) {
    if (patterns.some((p) => p.test(l))) return l;
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ");
}

function metaByProperty(html: string, prop: string): string | null {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1].trim()) || null;
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtmlEntities(m2[1].trim()) || null : null;
}

function metaByName(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']*)["']`, "i");
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1].trim()) || null;
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${esc}["']`, "i");
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtmlEntities(m2[1].trim()) || null : null;
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1].replace(/\s+/g, " ").trim()) || null : null;
}

function linkHrefsMatchingRel(html: string, relNeedle: string): string[] {
  const out: string[] = [];
  const relRe = new RegExp(`rel=["'][^"']*${relNeedle}[^"']*["']`, "i");
  const re = /<link\s+([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (!relRe.test(attrs)) continue;
    const hm = /href=["']([^"']+)["']/i.exec(attrs);
    if (hm?.[1]) out.push(hm[1].trim());
  }
  return out;
}

function resolveUrl(base: string, ref: string): string | null {
  try {
    return new URL(ref.trim(), base).href;
  } catch {
    return null;
  }
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function looksLikeLogoUrl(u: string): boolean {
  return /logo|brand|mark|favicon|icon|apple-touch|avatar|badge/i.test(u);
}

/**
 * Fetches a public page and extracts text + link + image candidates for profile import.
 */
export async function scrapeWebsiteProfileHints(pageUrl: string): Promise<WebsiteProfileHintsResult> {
  const normalized = pageUrl.trim().startsWith("http") ? pageUrl.trim() : `https://${pageUrl.trim()}`;
  assertImportableHttpUrl(normalized);

  const res = await fetch(normalized, { redirect: "follow", cache: "no-store", headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`fetch_status_${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new Error("not_html");
  }
  const html = await res.text();
  const base = res.url || normalized;

  const ogTitle = metaByProperty(html, "og:title");
  const siteName = metaByProperty(html, "og:site_name");
  const suggestedSiteName = (ogTitle || siteName || titleTag(html))?.slice(0, 200) ?? null;

  const ogDesc = metaByProperty(html, "og:description");
  const twDesc = metaByName(html, "twitter:description");
  const metaDesc = metaByName(html, "description");
  const suggestedDescription =
    (ogDesc || twDesc || metaDesc)?.replace(/\s+/g, " ").trim().slice(0, 4000) || null;

  const links = Array.from(html.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map((m) => m[0]);
  const socials: WebsiteSocialHints = {
    facebookUrl: firstMatchingLink(links, [/facebook\.com\//i]),
    instagramUrl: firstMatchingLink(links, [/instagram\.com\//i]),
    twitterUrl: firstMatchingLink(links, [/twitter\.com\//i, /x\.com\//i]),
    tiktokUrl: firstMatchingLink(links, [/tiktok\.com\//i]),
    youtubeUrl: firstMatchingLink(links, [/youtube\.com\//i, /youtu\.be\//i]),
    soundcloudUrl: firstMatchingLink(links, [/soundcloud\.com\//i]),
  };

  const imageUrls: string[] = [];

  const ogImage = metaByProperty(html, "og:image");
  if (ogImage) {
    const abs = resolveUrl(base, ogImage);
    if (abs) imageUrls.push(abs);
  }
  const twImage = metaByName(html, "twitter:image");
  if (twImage) {
    const abs = resolveUrl(base, twImage);
    if (abs) imageUrls.push(abs);
  }

  for (const needle of ["apple-touch-icon", "shortcut icon", "icon"]) {
    for (const href of linkHrefsMatchingRel(html, needle)) {
      const abs = resolveUrl(base, href);
      if (abs) imageUrls.push(abs);
    }
  }

  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let im: RegExpExecArray | null;
  let count = 0;
  while ((im = imgRe.exec(html)) !== null && count < 40) {
    const src = im[1]?.trim();
    if (!src || src.startsWith("data:")) continue;
    const abs = resolveUrl(base, src);
    if (abs && !/^javascript:/i.test(abs)) {
      imageUrls.push(abs);
      count++;
    }
  }

  const unique = dedupe(imageUrls);
  const logoLike = unique.filter((u) => looksLikeLogoUrl(u));
  const logoCandidates = dedupe([...logoLike, ...unique.slice(0, 3)]).slice(0, 10);
  const imageCandidates = unique.slice(0, 18);

  return {
    sourceUrl: base,
    suggestedSiteName,
    suggestedDescription,
    socials,
    logoCandidates,
    imageCandidates,
  };
}
