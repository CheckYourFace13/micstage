/**
 * Re-sources public listing map pins from public-domain geocoders.
 *
 * Places coordinates cannot be cached beyond 30 days and cannot be shown next to a non-Google
 * map, and our public map is OpenStreetMap-based. So Google is used only to decide *whether* a
 * venue exists (place id + match), while the coordinates we store and plot are geocoded from the
 * listing's own address.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { geocodeAddressWithoutGoogle } from "@/lib/geo/nonGoogleGeocode";

export type CoordinateSourcingResult = {
  scanned: number;
  resourced: number;
  unresolved: number;
  bySource: Record<string, number>;
};

/** Listings whose pin is missing or still Google-sourced, newest-visible first. */
export async function sourceListingCoordinatesWithoutGoogle(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<CoordinateSourcingResult> {
  const limit = opts?.limit ?? 25;
  // Retry addresses that no geocoder could place, but only after a week, so a bad address
  // cannot spin every tick while a temporarily rate-limited one still gets another chance.
  const retryUnresolvedBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      removedAt: null,
      OR: [
        { coordSource: null },
        { coordSource: "google" },
        { coordSource: "unresolved", coordsUpdatedAt: { lte: retryUnresolvedBefore } },
      ],
    },
    select: { id: true, formattedAddress: true, city: true, region: true, coordSource: true },
    // Published listings are the ones actually plotted, so heal them first.
    orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  const result: CoordinateSourcingResult = { scanned: 0, resourced: 0, unresolved: 0, bySource: {} };

  for (const row of rows) {
    result.scanned += 1;
    const hit = await geocodeAddressWithoutGoogle(row);
    if (!hit) {
      /**
       * Mark the attempt so a permanently unmappable listing cannot spin forever, and drop any
       * Google-sourced pin: failing to find a lawful replacement is not a reason to keep
       * content we are no longer permitted to store.
       */
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          coordSource: "unresolved",
          coordsUpdatedAt: new Date(),
          ...(row.coordSource === "google" ? { lat: null, lng: null } : {}),
        },
      });
      result.unresolved += 1;
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        lat: hit.lat,
        lng: hit.lng,
        coordSource: hit.source,
        coordsUpdatedAt: new Date(),
      },
    });
    result.resourced += 1;
    result.bySource[hit.source] = (result.bySource[hit.source] ?? 0) + 1;
    await new Promise((r) => setTimeout(r, 120));
  }

  return result;
}
