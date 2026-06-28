import type { Prisma, PrismaClient, PublicListingVerificationStatus } from "@/generated/prisma/client";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";

/** Listings shown in public discovery (exclude claimed duplicates, outdated, and unverified). */
export const PUBLIC_DISCOVERY_VERIFICATION = ["VERIFIED", "NEEDS_REVIEW"] as const;

export function publicListingWhereDiscoverable() {
  return {
    claimedVenueId: null,
    verificationStatus: { in: [...PUBLIC_DISCOVERY_VERIFICATION] },
  };
}

const listingSelect = {
  id: true,
  slug: true,
  name: true,
  formattedAddress: true,
  city: true,
  region: true,
  country: true,
  lat: true,
  lng: true,
  timeZone: true,
  websiteUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  tiktokUrl: true,
  youtubeUrl: true,
  sourceUrl: true,
  sourceName: true,
  lastVerifiedAt: true,
  verificationStatus: true,
  claimStatus: true,
  claimedVenueId: true,
  about: true,
  hostName: true,
  signupMethod: true,
  cost: true,
  ageRestriction: true,
  equipmentNotes: true,
  accessibilityNotes: true,
  schedules: {
    where: { isActive: true },
    orderBy: [{ weekday: "asc" as const }, { startTimeMin: "asc" as const }],
    select: {
      id: true,
      weekday: true,
      startTimeMin: true,
      endTimeMin: true,
      timeZone: true,
      title: true,
      description: true,
      performanceFormat: true,
      signupMethod: true,
      lastVerifiedAt: true,
    },
  },
} satisfies Prisma.PublicOpenMicListingSelect;

export type PublicOpenMicListingPayload = Prisma.PublicOpenMicListingGetPayload<{ select: typeof listingSelect }>;

export async function loadDiscoverablePublicListings(
  prisma: PrismaClient,
): Promise<PublicOpenMicListingPayload[]> {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: publicListingWhereDiscoverable(),
    orderBy: [{ name: "asc" }],
    select: listingSelect,
  });
  return rows.filter((l) => isPublicListingNameOk(l.name));
}

export async function loadPublicOpenMicListingBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<PublicOpenMicListingPayload | null> {
  return prisma.publicOpenMicListing.findUnique({
    where: { slug },
    select: listingSelect,
  });
}

export async function loadDiscoveryHomeStats(prisma: PrismaClient) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const [verifiedListings, bookableVenues, recentlyVerified, openSlotsThisWeek, listingRegions, venueRegions] =
    await Promise.all([
    prisma.publicOpenMicListing.count({
      where: {
        ...publicListingWhereDiscoverable(),
        verificationStatus: "VERIFIED",
      },
    }),
    prisma.venue.count(),
    prisma.publicOpenMicListing.count({
      where: {
        ...publicListingWhereDiscoverable(),
        lastVerifiedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.slot.count({
      where: {
        status: "AVAILABLE",
        instance: {
          isCancelled: false,
          date: { gte: new Date(), lte: weekEnd },
        },
      },
    }),
    prisma.publicOpenMicListing.groupBy({
      by: ["region"],
      where: { ...publicListingWhereDiscoverable(), region: { not: null } },
    }),
    prisma.venue.groupBy({
      by: ["region"],
      where: { region: { not: null } },
    }),
  ]);

  const metroMarkets = new Set(
    [...listingRegions, ...venueRegions].map((r) => (r.region ?? "").trim().toUpperCase()).filter(Boolean),
  ).size;

  return { verifiedListings, bookableVenues, recentlyVerified, openSlotsThisWeek, metroMarkets };
}

export async function loadFeaturedPublicListings(
  prisma: PrismaClient,
  opts: { limit?: number } = {},
): Promise<PublicOpenMicListingPayload[]> {
  const { limit = 4 } = opts;
  return prisma.publicOpenMicListing.findMany({
    where: {
      ...publicListingWhereDiscoverable(),
      verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW"] },
    },
    orderBy: [{ lastVerifiedAt: "desc" }, { name: "asc" }],
    take: limit,
    select: listingSelect,
  });
}
