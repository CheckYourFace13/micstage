/** Google AdSense publisher ID (MicStage). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-9572509189594279";

/** Numeric publisher ID for ads.txt (no `ca-` prefix). */
export const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";

/** IAB ads.txt authorized seller line for google.com (also written to public/ads.txt on build). */
export const ADSENSE_ADS_TXT_LINE = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0`;

/** True in production, or when explicitly enabled for local testing. */
export const ADSENSE_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true";

/** Affiliate-commerce resource pages — never stack AdSense on top of Amazon. */
const ADS_BLOCKED_RESOURCE_SLUGS = new Set(["open-mic-gear"]);

function normalizePath(pathname: string): string {
  return (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
}

/**
 * AdSense may load only on:
 * - /resources (index)
 * - editorial /resources/[slug] (not affiliate gear)
 * - /locations/[market]/open-mics (strong city open-mic hubs)
 *
 * Not on discovery product hubs, performers pages, homepage, host, FAQ, ops, or listing detail.
 */
export function shouldShowAdsOnPath(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (path === "/resources") return true;

  const resourceMatch = /^\/resources\/([^/]+)$/.exec(path);
  if (resourceMatch) {
    return !ADS_BLOCKED_RESOURCE_SLUGS.has(resourceMatch[1]!);
  }

  // City/market open-mic hubs only — not /locations index or /locations/.../performers.
  if (/^\/locations\/[^/]+\/open-mics$/.test(path)) return true;

  return false;
}

/** Display ad unit slot IDs from AdSense (empty until configured in env). */
export const ADSENSE_SLOTS = {
  articleTop: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_TOP?.trim() ?? "",
  articleMid: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_MID?.trim() ?? "",
  articleBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_BOTTOM?.trim() ?? "",
  directoryBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DIRECTORY_BOTTOM?.trim() ?? "",
} as const;
