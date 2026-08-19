/**
 * Track when a Host schedules their first night at a venue different from their first night.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const HOST_SECOND_VENUE_EVENT = "HOST_SECOND_VENUE_ACTIVATED";

export async function maybeRecordHostSecondVenueActivation(
  prisma: PrismaClient,
  promoterId: string,
  newVenueId: string,
  nightId: string,
): Promise<boolean> {
  const allNights = await prisma.promoterNight.findMany({
    where: { series: { promoterId } },
    select: { id: true, venueId: true, date: true, createdAt: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  if (allNights.length < 2) return false;

  const firstVenueId = allNights[0]?.venueId;
  if (!firstVenueId || newVenueId === firstVenueId) return false;

  const priorVenues = new Set(
    allNights.filter((n) => n.id !== nightId).map((n) => n.venueId),
  );
  if (priorVenues.has(newVenueId)) return false;
  if (!priorVenues.has(firstVenueId)) return false;

  const prior = await prisma.marketingEvent.findFirst({
    where: {
      type: "INTERNAL_AUDIT",
      payload: { path: ["event"], equals: HOST_SECOND_VENUE_EVENT },
      AND: { payload: { path: ["promoterId"], equals: promoterId } },
    },
    select: { id: true },
  });
  if (prior) return false;

  await prisma.marketingEvent.create({
    data: {
      type: "INTERNAL_AUDIT",
      payload: {
        event: HOST_SECOND_VENUE_EVENT,
        promoterId,
        firstVenueId,
        secondVenueId: newVenueId,
        nightId,
      },
    },
  });
  return true;
}
