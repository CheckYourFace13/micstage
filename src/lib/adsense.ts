/** Google AdSense publisher ID (MicStage). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-9572509189594279";

/** Numeric publisher ID for ads.txt (no `ca-` prefix). */
export const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";

/** IAB ads.txt authorized seller line for google.com (also written to public/ads.txt on build). */
export const ADSENSE_ADS_TXT_LINE = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0`;

/** True in production, or when explicitly enabled for local testing. */
export const ADSENSE_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true";

const ADS_BLOCKED_PATH_PREFIXES = [
  "/register",
  "/login",
  "/dashboard",
  "/artist",
  "/venue",
  "/internal",
  "/logout",
  "/reset",
  "/api",
] as const;

/**
 * Central guard for whether display ads may render on a pathname.
 * Public SEO/discovery/resource routes return true; auth, product, and conversion routes return false.
 */
export function shouldShowAdsOnPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  for (const prefix of ADS_BLOCKED_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return false;
    }
  }
  return true;
}

/** Display ad unit slot IDs from AdSense (empty until configured in env). */
export const ADSENSE_SLOTS = {
  articleTop: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_TOP?.trim() ?? "",
  articleMid: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_MID?.trim() ?? "",
  articleBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_BOTTOM?.trim() ?? "",
  directoryBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DIRECTORY_BOTTOM?.trim() ?? "",
} as const;
