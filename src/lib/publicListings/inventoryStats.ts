import type { PrismaClient } from "@/generated/prisma/client";
import { loadPublicDiscoveryLocationRows } from "@/lib/publicListings/discoveryMerge";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { PUBLIC_DISCOVERY_VERIFICATION } from "@/lib/publicListings/queries";

export type DiscoveryInventoryStats = {
  totalListings: number;
  verifiedListings: number;
  bookableVenues: number;
  claimedVenues: number;
  discoveryMarkets: number;
};

const discoverableListingWhere = {
  claimedVenueId: null,
  verificationStatus: { in: [...PUBLIC_DISCOVERY_VERIFICATION] },
};

export async function loadDiscoveryInventoryStats(prisma: PrismaClient): Promise<DiscoveryInventoryStats> {
  const [claimedVenues, bookableVenues, listingRows, marketRows] = await Promise.all([
    prisma.venue.count(),
    prisma.venue.count({
      where: { eventTemplates: { some: { isPublic: true } } },
    }),
    prisma.publicOpenMicListing.findMany({
      where: discoverableListingWhere,
      select: { name: true, verificationStatus: true },
    }),
    loadPublicDiscoveryLocationRows(prisma),
  ]);

  const qualityListings = listingRows.filter((l) => isPublicListingNameOk(l.name));
  const verifiedListings = qualityListings.filter((l) => l.verificationStatus === "VERIFIED").length;

  return {
    totalListings: qualityListings.length,
    verifiedListings,
    bookableVenues,
    claimedVenues,
    discoveryMarkets: marketRows.length,
  };
}
