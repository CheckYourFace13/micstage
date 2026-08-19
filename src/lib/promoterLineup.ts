import type { PrismaClient } from "@/generated/prisma/client";
import { publicLineupHrefForNight, publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { storageYmdUtc } from "@/lib/venuePublicLineup";

export { publicLineupPathForNightId, publicLineupHrefForNight };

/** Prefer host-night canonical URL; fall back to legacy venue+date when no night id. */
export async function publicLineupHrefForVenueDate(
  prisma: PrismaClient,
  venueId: string,
  dateUtcMidnight: Date,
  nightId?: string | null,
): Promise<string | null> {
  if (nightId) {
    return publicLineupHrefForNight(prisma, nightId);
  }

  const night = await prisma.promoterNight.findFirst({
    where: { venueId, date: dateUtcMidnight },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (night) {
    return publicLineupHrefForNight(prisma, night.id);
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (!venue) return null;

  const inst = await prisma.eventInstance.findFirst({
    where: {
      date: dateUtcMidnight,
      template: { venueId, promoterNightId: null },
    },
    select: { id: true },
  });
  if (!inst) return null;

  const ymd = storageYmdUtc(dateUtcMidnight);
  return `/venues/${venue.slug}/lineup/${ymd}`;
}
