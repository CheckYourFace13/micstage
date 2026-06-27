import type { Prisma, PrismaClient, PublicListingVerificationStatus } from "@/generated/prisma/client";

/** Listings shown in public discovery (exclude claimed duplicates and outdated). */
export const PUBLIC_DISCOVERY_VERIFICATION: PublicListingVerificationStatus[] = [
  "VERIFIED",
  "NEEDS_REVIEW",
  "UNVERIFIED",
];

export function publicListingWhereDiscoverable() {
  return {
    claimedVenueId: null,
    verificationStatus: { not: "OUTDATED" as const },
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
  return prisma.publicOpenMicListing.findMany({
    where: publicListingWhereDiscoverable(),
    orderBy: [{ name: "asc" }],
    select: listingSelect,
  });
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

  const [verifiedListings, bookableVenues, recentlyVerified] = await Promise.all([
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
  ]);

  return { verifiedListings, bookableVenues, recentlyVerified };
}

export async function loadFeaturedPublicListings(
  prisma: PrismaClient,
  opts: { region?: string; limit?: number } = {},
): Promise<PublicOpenMicListingPayload[]> {
  const { region = "IL", limit = 4 } = opts;
  return prisma.publicOpenMicListing.findMany({
    where: {
      ...publicListingWhereDiscoverable(),
      verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW"] },
      region: { equals: region, mode: "insensitive" },
    },
    orderBy: [{ lastVerifiedAt: "desc" }, { name: "asc" }],
    take: limit,
    select: listingSelect,
  });
}
