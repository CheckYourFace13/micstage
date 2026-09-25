/**
 * Google Maps Platform retention enforcement.
 *
 * Maps Platform terms allow us to keep a `place_id` indefinitely (it is explicitly exempt from
 * the caching restrictions) and to cache Places latitude/longitude for at most 30 consecutive
 * calendar days. No grant covers business names, formatted addresses, or websites, so those are
 * treated as transient decision inputs: we use them during a verification call and never rely on
 * them being there afterwards.
 *
 * This job deletes cached Google Maps Content once it expires while preserving the verification
 * facts we are allowed to keep — the place id, the match score, and our own derived conclusions.
 */
import type { PrismaClient } from "@/generated/prisma/client";

/** Maximum permitted retention for cached Places coordinates. */
export const GOOGLE_CONTENT_RETENTION_DAYS = 30;

export function googleContentExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + GOOGLE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export type GoogleContentPurgeResult = {
  placeLookupRowsPurged: number;
  growthLeadRowsPurged: number;
  listingCoordinateRowsPurged: number;
};

export async function purgeExpiredGoogleMapsContent(
  prisma: PrismaClient,
  opts?: { now?: Date; limit?: number },
): Promise<GoogleContentPurgeResult> {
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - GOOGLE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const limit = opts?.limit ?? 500;

  // Discovery place cache: keep lookupKey, outcome, matchScore, placeId and coordsVerified.
  const expiredLookups = await prisma.growthPlaceLookup.findMany({
    where: {
      OR: [
        { googleContentExpiresAt: { lte: now } },
        // Rows written before expiry tracking existed.
        { googleContentExpiresAt: null, updatedAt: { lte: cutoff } },
      ],
      NOT: {
        canonicalName: null,
        formattedAddress: null,
        website: null,
        websiteHost: null,
        lat: null,
        lng: null,
      },
    },
    select: { id: true },
    take: limit,
  });

  let placeLookupRowsPurged = 0;
  if (expiredLookups.length > 0) {
    const res = await prisma.growthPlaceLookup.updateMany({
      where: { id: { in: expiredLookups.map((r) => r.id) } },
      data: {
        canonicalName: null,
        formattedAddress: null,
        website: null,
        websiteHost: null,
        lat: null,
        lng: null,
        googleContentExpiresAt: null,
      },
    });
    placeLookupRowsPurged = res.count;
  }

  // Growth leads: the place id and verification timestamp stay; the copied content does not.
  const growthLeadRowsPurged = (
    await prisma.growthLead.updateMany({
      where: {
        googlePlaceVerifiedAt: { lte: cutoff },
        NOT: { placeCanonicalName: null, placeFormattedAddress: null, placeLat: null, placeLng: null },
      },
      data: {
        placeCanonicalName: null,
        placeFormattedAddress: null,
        placeLat: null,
        placeLng: null,
      },
    })
  ).count;

  /**
   * Public listings: any pin still attributed to Google is dropped. "unresolved" rows holding
   * coordinates are legacy Google pins whose re-sourcing failed, so they expire the same way.
   */
  const listingCoordinateRowsPurged = (
    await prisma.publicOpenMicListing.updateMany({
      where: {
        lat: { not: null },
        OR: [
          { coordSource: "google", OR: [{ coordsUpdatedAt: { lte: cutoff } }, { coordsUpdatedAt: null }] },
          { coordSource: "unresolved" },
        ],
      },
      data: { lat: null, lng: null, coordSource: null },
    })
  ).count;

  return { placeLookupRowsPurged, growthLeadRowsPurged, listingCoordinateRowsPurged };
}
