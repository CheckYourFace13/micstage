import * as cheerio from "cheerio";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function cleanTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  const cut = t.split(/\s*[|\u2013\u2014-]\s*/)[0]?.trim() ?? t;
  return cut.slice(0, 200) || "Discovered lead";
}

export type ExtractedContactHints = {
  nameGuess: string;
  emails: string[];
  instagramUrls: string[];
  youtubeUrls: string[];
  tiktokUrls: string[];
  facebookUrls: string[];
  sameHostPaths: string[];
  /** Whitespace-collapsed body text for open-mic / live-event signal scoring. */
  bodyTextSample: string;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pull mailto links, obvious socials, and same-host anchors from HTML.
 */
export function extractFromHtml(pageUrl: string, html: string, opts?: { maxSameHostLinks?: number }): ExtractedContactHints {
  const maxSame = opts?.maxSameHostLinks ?? 40;
  const pageHost = hostOf(pageUrl);
  const $ = cheerio.load(html);
  const title = cleanTitle($("title").first().text() || $("h1").first().text() || "");
  const emails = new Set<string>();
  const instagramUrls = new Set<string>();
  const youtubeUrls = new Set<string>();
  const tiktokUrls = new Set<string>();
  const facebookUrls = new Set<string>();
  const sameHostPaths = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const lower = href.toLowerCase();
    if (lower.startsWith("mailto:")) {
      const addr = decodeURIComponent(href.slice("mailto:".length).split("?")[0] ?? "").trim();
      if (addr.includes("@")) emails.add(addr);
      return;
    }
    if (lower.includes("instagram.com/")) {
      try {
        const u = new URL(href.startsWith("http") ? href : `https:${href}`);
        instagramUrls.add(u.toString().split("?")[0]!);
      } catch {
        /* skip */
      }
      return;
    }
    if (lower.includes("youtube.com/") || lower.includes("youtu.be/")) {
      try {
        const u = new URL(href.startsWith("http") ? href : `https:${href}`);
        youtubeUrls.add(u.toString().split("?")[0]!);
      } catch {
        /* skip */
      }
      return;
    }
    if (lower.includes("tiktok.com/@")) {
      try {
        const u = new URL(href.startsWith("http") ? href : `https:${href}`);
        tiktokUrls.add(u.toString().split("?")[0]!);
      } catch {
        /* skip */
      }
      return;
    }
    if (lower.includes("facebook.com/") || lower.includes("fb.com/")) {
      try {
        const u = new URL(href.startsWith("http") ? href : `https:${href}`);
        const path = u.pathname.toLowerCase();
        if (path.includes("/share") || path.includes("/sharer")) return;
        facebookUrls.add(u.toString().split("?")[0]!);
      } catch {
        /* skip */
      }
      return;
    }
    if (pageHost && (href.startsWith("/") || lower.includes(pageHost))) {
      try {
        const abs = new URL(href, pageUrl);
        if (hostOf(abs.toString()) === pageHost && sameHostPaths.size < maxSame) {
          const p = abs.pathname.toLowerCase();
          if (
            /contact|book|booking|rental|private|events?|calendar|about|team|staff|press|open[\s-]?mic|mic[\s-]?night|talent|perform|entertain|host|venue|faq/i.test(
              p,
            ) ||
            p === "/" ||
            p.length < 80
          ) {
            sameHostPaths.add(abs.toString().split("#")[0]!);
          }
        }
      } catch {
        /* skip */
      }
    }
  });

  const bodyText = $("body").text();
  const bodyTextSample = bodyText.replace(/\s+/g, " ").trim().slice(0, 18_000);
  const found = bodyText.match(EMAIL_RE);
  if (found) {
    for (const e of found) {
      const low = e.toLowerCase();
      if (!low.endsWith(".png") && !low.endsWith(".jpg") && low.length < 120) emails.add(e);
    }
  }

  return {
    nameGuess: title,
    emails: [...emails].slice(0, 8),
    instagramUrls: [...instagramUrls].slice(0, 5),
    youtubeUrls: [...youtubeUrls].slice(0, 3),
    tiktokUrls: [...tiktokUrls].slice(0, 3),
    facebookUrls: [...facebookUrls].slice(0, 4),
    sameHostPaths: [...sameHostPaths].slice(0, maxSame),
    bodyTextSample,
  };
}

const CONTACT_PATH_PRIORITY: { re: RegExp; w: number }[] = [
  { re: /contact|inquir/i, w: 100 },
  { re: /book|booking|rental|private/i, w: 95 },
  { re: /events?|calendar|schedule/i, w: 90 },
  { re: /open[\s-]?mic|mic[\s-]?night/i, w: 88 },
  { re: /talent|perform|entertain|host/i, w: 82 },
  { re: /about|team|staff/i, w: 70 },
  { re: /faq|press/i, w: 55 },
];

/**
 * Best same-host path for venue outreach when no email (contact form / events page).
 */
export function pickPrimaryVenueContactUrl(paths: string[]): string | null {
  if (!paths.length) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const raw of paths) {
    try {
      const p = new URL(raw).pathname.toLowerCase();
      let s = 10;
      for (const { re, w } of CONTACT_PATH_PRIORITY) {
        if (re.test(p)) s = Math.max(s, w);
      }
      if (s > bestScore) {
        bestScore = s;
        best = raw.split("#")[0] ?? raw;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}
