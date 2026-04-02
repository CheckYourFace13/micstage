import type { Metadata } from "next";

function normalizeSiteOrigin(raw: string): string {
  let r = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(r)) {
    r = `https://${r}`;
  }
  const hostMatch = /^https?:\/\/([^/:?#]+)/i.exec(r);
  const host = (hostMatch?.[1] ?? "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host.startsWith("127.") ||
    host.endsWith(".local") ||
    host.includes("localhost");
  // Prefer HTTPS for any non-local host so metadataBase / canonicals never use accidental http:// in production.
  if (!isLocal && r.startsWith("http://")) {
    r = `https://${r.slice("http://".length)}`;
  }
  return r;
}

/** Production default; override with APP_URL / NEXT_PUBLIC_APP_URL in env (metadata / OG). */
export function siteOrigin(): string {
  return normalizeSiteOrigin(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://micstage.com");
}

/**
 * Canonical public base URL for server-issued redirects (e.g. admin logout).
 * Prefer `APP_URL`, then `NEXT_PUBLIC_APP_URL`, then `https://micstage.com` — do not use `request.url` origin.
 */
export function siteOriginForServerRedirect(): string {
  return normalizeSiteOrigin(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://micstage.com");
}

export function absoluteUrl(path: string): string {
  const base = siteOrigin();
  if (!path || path === "/") return `${base}/`;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Absolute URL using `siteOriginForServerRedirect` (not `request.url`). */
export function absoluteServerRedirectUrl(path: string): string {
  const base = siteOriginForServerRedirect();
  if (!path || path === "/") return `${base}/`;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Canonical + Open Graph + Twitter for indexable public routes (not for private/auth). */
export function buildPublicMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const canonical = absoluteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: canonical,
      siteName: "MicStage",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}

/** Lineup-first public pages: strong title + context for social crawlers. */
export function buildLineupPageMetadata(opts: {
  venueName: string;
  venueSlug: string;
  ymd: string;
  place: string;
}): Metadata {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.ymd);
  let dateSentence = opts.ymd;
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dateSentence = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  }
  const path = `/venues/${opts.venueSlug}/lineup/${opts.ymd}`;
  const title = `${opts.venueName} open mic lineup — ${opts.ymd}`;
  const description = `Open mic lineup for ${opts.venueName}${opts.place ? ` in ${opts.place}` : ""} on ${dateSentence}. Set times, who’s booked, and open slots — MicStage.`;
  return {
    ...buildPublicMetadata({ title, description, path }),
    title: { absolute: `${title} | MicStage` },
  };
}
