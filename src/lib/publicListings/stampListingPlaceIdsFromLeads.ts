import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Deterministic safe stamp: copy GrowthLead.googlePlaceId onto NEEDS_REVIEW listings
 * that lack one. Does not call Google, invent places, or lower verification standards.
 */
export async function stampListingPlaceIdsFromLeads(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<{ scanned: number; stamped: number }> {
  const limit = Math.min(80, Math.max(0, opts?.limit ?? 40));
  if (limit <= 0) return { scanned: 0, stamped: 0 };

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      removedAt: null,
      claimedVenueId: null,
      verificationStatus: "NEEDS_REVIEW",
      googlePlaceId: null,
      growthLead: { googlePlaceId: { not: null } },
    },
    select: {
      id: true,
      internalNotes: true,
      growthLead: { select: { googlePlaceId: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let stamped = 0;
  for (const row of rows) {
    const placeId = row.growthLead?.googlePlaceId?.trim();
    if (!placeId) continue;
    // googlePlaceId is unique — never stamp a place already claimed by another listing.
    const taken = await prisma.publicOpenMicListing.findFirst({
      where: { googlePlaceId: placeId, NOT: { id: row.id } },
      select: { id: true },
    });
    if (taken) continue;
    const note = `[${new Date().toISOString().slice(0, 10)}] stamped googlePlaceId from growth lead`;
    try {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          googlePlaceId: placeId,
          internalNotes: row.internalNotes?.trim() ? `${row.internalNotes.trim()}\n${note}` : note,
        },
      });
      stamped += 1;
    } catch (e) {
      // Race / unique constraint: skip and continue the backlog (do not abort the tick).
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: unknown }).code) : "";
      if (code === "P2002") continue;
      throw e;
    }
  }

  return { scanned: rows.length, stamped };
}
