import type { Metadata } from "next";

/** Production default; override with APP_URL / NEXT_PUBLIC_APP_URL in env. */
export function siteOrigin(): string {
  let raw = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://micstage.com").trim();
  raw = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw;
}

export function absoluteUrl(path: string): string {
  const base = siteOrigin();
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
