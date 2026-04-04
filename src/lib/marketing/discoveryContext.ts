import type { Venue } from "@/generated/prisma/client";
import { primaryDiscoverySlugForVenue, rollupDiscoveryLabel } from "@/lib/discoveryMarket";

export type VenueDiscoveryRollupContext = {
  /** Discovery slug used on `/locations/[slug]/performers` when present. */
  discoveryMarketSlug: string | null;
  /** Human label from fixed rollups or city/region (matches public directory intent). */
  discoveryLabel: string | null;
};

/**
 * Uses the same city/region → slug rules as public discovery (`primaryDiscoverySlugForVenue`).
 * Pass `counts` from `computeCitySlugVenueCounts` over all venues with city set.
 */
export function discoveryRollupContextForVenue(
  venue: Pick<Venue, "city" | "region">,
  counts: Map<string, number>,
): VenueDiscoveryRollupContext {
  const city = (venue.city ?? "").trim();
  if (!city) return { discoveryMarketSlug: null, discoveryLabel: null };
  const slug = primaryDiscoverySlugForVenue(city, venue.region, counts);
  if (!slug) return { discoveryMarketSlug: null, discoveryLabel: null };
  const rollup = rollupDiscoveryLabel(slug);
  const discoveryLabel = rollup ?? (venue.region?.trim() ? `${city}, ${venue.region.trim()}` : city);
  return { discoveryMarketSlug: slug, discoveryLabel };
}
