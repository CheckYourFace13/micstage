"use client";

import type { ReactNode } from "react";
import {
  AMAZON_ASSOCIATES_NETWORK,
  AMAZON_ASSOCIATES_TRACKING_ID,
  amazonSearchUrl,
} from "@/lib/amazonAssociates";
import { trackMarketingEvent } from "@/lib/marketingTracking";

type Props = {
  category: string;
  searchKeywords: string;
  children: ReactNode;
  className?: string;
};

/**
 * Outbound Amazon Associates search link with a single GA4 affiliate_click per click.
 * Does not send product IDs or user-identifying Amazon data.
 */
export function AmazonAffiliateLink({ category, searchKeywords, children, className }: Props) {
  const href = amazonSearchUrl(searchKeywords);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      data-affiliate-network={AMAZON_ASSOCIATES_NETWORK}
      data-affiliate-category={category}
      onClick={() => {
        trackMarketingEvent("affiliate_click", {
          affiliate_network: AMAZON_ASSOCIATES_NETWORK,
          tracking_id: AMAZON_ASSOCIATES_TRACKING_ID,
          category,
          destination: "amazon_search",
        });
      }}
    >
      {children}
    </a>
  );
}
