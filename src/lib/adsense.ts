/** Google AdSense publisher ID (MicStage). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-9572509189594279";

/** Numeric publisher ID for ads.txt (no `ca-` prefix). */
export const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";

/** IAB ads.txt authorized seller line for google.com (also written to public/ads.txt on build). */
export const ADSENSE_ADS_TXT_LINE = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0`;

/** True in production, or when explicitly enabled for local testing. */
export const ADSENSE_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true";

function normalizePath(pathname: string): string {
  return (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
}

/**
 * Path-only AdSense gate (used by root `AdSenseScript`).
 *
 * Allows:
 * - /resources (index)
 * - /locations/[market]/open-mics (strong city open-mic hubs)
 *
 * Does NOT allow `/resources/[slug]` by path alone — unknown slugs call `notFound()`
 * while keeping the URL, which would otherwise load ads on a 404. Real article pages
 * pass `trustedEditorialSurface` into `AdSenseDisplayAd` (which loads the script).
 *
 * Not on discovery product hubs, performers pages, homepage, host, FAQ, ops, listing detail,
 * auth, claim, or generic 404 URLs.
 */
export function shouldShowAdsOnPath(pathname: string): boolean {
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
