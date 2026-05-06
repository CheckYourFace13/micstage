import type { PrismaClient } from "@/generated/prisma/client";
import { storageYmdUtc } from "@/lib/venuePublicLineup";

/** Public lineup path when an `EventInstance` exists for this venue + calendar day. */
export async function publicLineupHrefForVenueDate(
  prisma: PrismaClient,
  venueId: string,
  dateUtcMidnight: Date,
): Promise<string | null> {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (!venue) return null;

  const inst = await prisma.eventInstance.findFirst({
    where: {
      date: dateUtcMidnight,
      template: { venueId },
    },
    select: { id: true },
  });
  if (!inst) return null;

  const ymd = storageYmdUtc(dateUtcMidnight);
  return `/venues/${venue.slug}/lineup/${ymd}`;
}
