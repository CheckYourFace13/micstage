/**
 * Host event rights vs venue management rights.
 *
 * Hosts may schedule nights at any MicStage Venue as event location (PromoterNight.venueId).
 * PromoterVenueAccess APPROVED remains for delegated venue-management authority only.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export async function assertVenueExistsForHostNight(prisma: PrismaClient, venueId: string): Promise<boolean> {
  const row = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  return Boolean(row);
}
