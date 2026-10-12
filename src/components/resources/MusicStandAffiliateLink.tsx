"use client";

import type { ReactNode } from "react";
import {
  AWIN_AFFILIATE_NETWORK,
  AWIN_MUSIC_STAND_ADVERTISER,
  AWIN_MUSIC_STAND_BEST_SELLERS_URL,
  AWIN_MUSIC_STAND_DESTINATION,
} from "@/lib/awinAffiliate";
import { trackMarketingEvent } from "@/lib/marketingTracking";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Single outbound The Music Stand (Awin) text link with GA4 affiliate_click.
 * Editorial surfaces only — no banners or repeated placements.
 */
export function MusicStandAffiliateLink({ children, className }: Props) {
  return (
    <a
      href={AWIN_MUSIC_STAND_BEST_SELLERS_URL}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      data-affiliate-network={AWIN_AFFILIATE_NETWORK}
      data-affiliate-advertiser={AWIN_MUSIC_STAND_ADVERTISER}
      onClick={() => {
        trackMarketingEvent("affiliate_click", {
          affiliate_network: AWIN_AFFILIATE_NETWORK,
          advertiser: AWIN_MUSIC_STAND_ADVERTISER,
          destination: AWIN_MUSIC_STAND_DESTINATION,
        });
      }}
    >
      {children}
    </a>
  );
}
