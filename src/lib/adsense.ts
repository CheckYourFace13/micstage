/** Google AdSense publisher ID (MicStage). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-9572509189594279";

/** Numeric publisher ID for ads.txt (no `ca-` prefix). */
export const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";

/** IAB ads.txt authorized seller line for google.com (also written to public/ads.txt on build). */
export const ADSENSE_ADS_TXT_LINE = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0`;

/**
 * Ad unit / loader kill switch while awaiting AdSense approval.
 * Ownership signals (ads.txt + google-adsense-account meta) stay live.
 * Re-enable with NEXT_PUBLIC_ENABLE_ADSENSE=true after approval.
 */
export const ADSENSE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true";

function normalizePath(pathname: string): string {
  return (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
}

/**
 * Path-only AdSense gate (used by root `AdSenseScript`).
 * Currently returns false for all paths while ADSENSE_ENABLED is off.
 * After approval, restore allowlist for /resources (+ trusted article surfaces)
 * and strong /locations/{slug}/open-mics hubs only.
 */
export function shouldShowAdsOnPath(pathname: string): boolean {
  if (!ADSENSE_ENABLED) return false;
  const path = normalizePath(pathname);

  if (path === "/resources") return true;

  // Never path-allow /resources/<slug> — including missing slugs that render not-found.
  if (/^\/resources(\/|$)/.test(path)) return false;

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
