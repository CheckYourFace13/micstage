/** Google AdSense publisher ID (MicStage). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-9572509189594279";

/** Numeric publisher ID for ads.txt (no `ca-` prefix). */
export const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";

/** IAB ads.txt authorized seller line for google.com (also written to public/ads.txt on build). */
export const ADSENSE_ADS_TXT_LINE = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0`;

/** True in production, or when explicitly enabled for local testing. */
export const ADSENSE_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true";

/**
 * Exact paths where AdSense may load (editorial / discovery directories).
 * Venue/artist/map discover hubs are OK; detail/lineup/ops routes are not.
 */
const ADS_ALLOWED_EXACT = new Set([
  "/resources",
  "/find-open-mics",
  "/venues",
  "/artists",
  "/performers",
  "/map",
  "/locations",
  "/compare",
]);

/** Prefixes where AdSense may load (resource articles + city/market hubs). */
const ADS_ALLOWED_PREFIXES = ["/resources/", "/locations/"] as const;

function normalizePath(pathname: string): string {
  return (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
}

/**
 * Central guard for whether AdSense may load or render on a pathname.
 * Whitelist editorial/discovery only — never ops, booking, lineup, auth, or listing detail.
 */
export function shouldShowAdsOnPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (ADS_ALLOWED_EXACT.has(path)) return true;
  for (const prefix of ADS_ALLOWED_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/** Display ad unit slot IDs from AdSense (empty until configured in env). */
export const ADSENSE_SLOTS = {
  articleTop: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_TOP?.trim() ?? "",
  articleMid: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_MID?.trim() ?? "",
  articleBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_BOTTOM?.trim() ?? "",
  directoryBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DIRECTORY_BOTTOM?.trim() ?? "",
} as const;
