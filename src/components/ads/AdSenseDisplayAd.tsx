"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { ADSENSE_ENABLED, ADSENSE_PUBLISHER_ID, shouldShowAdsOnPath } from "@/lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export type AdSenseDisplayAdProps = {
  adSlot: string;
  className?: string;
  format?: "auto" | "rectangle" | "vertical" | "horizontal";
  responsive?: boolean;
  /** Minimum height in px to reduce layout shift while the unit loads. */
  minHeight?: number;
  /**
   * Set only from server-rendered editorial pages that already resolved a real article.
   * Required for /resources/[slug] because path-only gating would either ads-on-404 or
   * never allow real articles.
   */
  trustedEditorialSurface?: boolean;
};

export function AdSenseDisplayAd({
  adSlot,
  className = "",
  format = "auto",
  responsive = true,
  minHeight = 90,
  trustedEditorialSurface = false,
}: AdSenseDisplayAdProps) {
  const pathname = usePathname();
  const pushed = useRef(false);
  const slot = adSlot.trim();

  const mayShow =
    ADSENSE_ENABLED &&
    slot.length > 0 &&
    (trustedEditorialSurface || shouldShowAdsOnPath(pathname ?? ""));

  useEffect(() => {
    if (!mayShow || pushed.current || typeof window === "undefined") return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers or script load races should not break the page.
    }
  }, [mayShow, slot]);

  if (!mayShow) {
    return null;
  }

  return (
    <>
      {trustedEditorialSurface ? (
        <Script
          id="micstage-adsense"
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      ) : null}
      <aside
        className={`my-8 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 ${className}`.trim()}
        aria-label="Advertisement"
      >
        <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wider text-white/40">
          Advertisement
        </p>
        <div className="flex justify-center overflow-hidden" style={{ minHeight }}>
          <ins
            className="adsbygoogle block w-full"
            style={{ display: "block" }}
            data-ad-client={ADSENSE_PUBLISHER_ID}
            data-ad-slot={slot}
            data-ad-format={format}
            {...(responsive ? { "data-full-width-responsive": "true" as const } : {})}
          />
        </div>
      </aside>
    </>
  );
}
