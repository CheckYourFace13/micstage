import type { PrismaClient } from "@/generated/prisma/client";
import { computeCitySlugVenueCounts } from "@/lib/discoveryMarket";
import { discoveryRollupContextForVenue } from "@/lib/marketing/discoveryContext";
import { buildVenueOutreachEmailPayload, type MarketingEmailPayload } from "@/lib/marketing/emailPayloads";
import { buildVenueDiscoverySocialPayloads, type MarketingSocialPayload } from "@/lib/marketing/socialPayloads";
import { absoluteUrl } from "@/lib/publicSeo";

export type VenueOutreachDraft = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  discoveryMarketSlug: string | null;
  discoveryLabel: string | null;
  publicVenueUrl: string;
  publicLocationPerformersUrl: string | null;
  emailPayload: MarketingEmailPayload;
  socialPayloads: MarketingSocialPayload[];
};

/**
 * Loads venue + discovery rollup (same rules as public `/locations` / sitemap) and returns draft payloads.
 */
export async function loadVenueOutreachDraft(prisma: PrismaClient, venueId: string): Promise<VenueOutreachDraft | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      region: true,
      formattedAddress: true,
    },
  });
  if (!venue) return null;

  const venueSlices = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { city: true, region: true },
  });
  const counts = computeCitySlugVenueCounts(venueSlices);
  const { discoveryMarketSlug, discoveryLabel } = discoveryRollupContextForVenue(venue, counts);

  const publicVenueUrl = absoluteUrl(`/venues/${venue.slug}`);
  const publicLocationPerformersUrl = discoveryMarketSlug
    ? absoluteUrl(`/locations/${discoveryMarketSlug}/performers`)
    : null;

  const emailPayload = buildVenueOutreachEmailPayload({
    venueName: venue.name,
    discoveryLabel,
    publicVenueUrl,
    locationPerformersUrl: publicLocationPerformersUrl,
  });

  const socialPayloads = buildVenueDiscoverySocialPayloads({
    venueName: venue.name,
    discoveryLabel,
    publicVenueUrl,
    publicLocationPerformersUrl,
  });

  return {
    venueId: venue.id,
    venueName: venue.name,
    venueSlug: venue.slug,
    city: venue.city,
    region: venue.region,
    formattedAddress: venue.formattedAddress,
    discoveryMarketSlug,
    discoveryLabel,
    publicVenueUrl,
    publicLocationPerformersUrl,
    emailPayload,
    socialPayloads,
  };
}
