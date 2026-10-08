"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { ADSENSE_ENABLED, ADSENSE_PUBLISHER_ID, shouldShowAdsOnPath } from "@/lib/adsense";

/**
 * Loads the AdSense JS only on approved monetization surfaces.
 * Keeps google-adsense-account meta in root layout for ownership/review.
 */
export function AdSenseScript() {
  const pathname = usePathname() ?? "";
  if (!ADSENSE_ENABLED || !shouldShowAdsOnPath(pathname)) return null;

  return (
    <Script
      id="micstage-adsense"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
