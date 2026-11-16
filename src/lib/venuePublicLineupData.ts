import { getPrismaOrNull } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ensureVenueScheduleMaterialized } from "@/lib/venue/materializeVenueScheduleInstances";

/**
 * Public venue + lineup graph. Requires DB columns on `Slot`:
 * `bookingRestrictionModeOverride`, `restrictionHoursBeforeOverride`,
 * `onPremiseMaxDistanceMetersOverride` (plus existing slot/booking fields).
 * If the query fails after deploy, run migrations and `prisma generate`.
 */
export const publicVenueLineupInclude = {
  eventTemplates: {
    where: { isPublic: true },
    orderBy: [{ weekday: "asc" as const }, { startTimeMin: "asc" as const }],
    include: {
      instances: {
        where: { isCancelled: false },
        orderBy: { date: "asc" as const },
        take: 90,
        include: {
          slots: { orderBy: { startMin: "asc" as const }, include: { booking: true } },
        },
      },
    },
  },
} satisfies Prisma.VenueInclude;

export type PublicVenueForLineup = Prisma.VenueGetPayload<{ include: typeof publicVenueLineupInclude }>;

export type LineupTemplate = PublicVenueForLineup["eventTemplates"][number];
export type LineupInstance = LineupTemplate["instances"][number];

function hasUpcomingInstance(venue: PublicVenueForLineup, now: Date): boolean {
  const cutoff = now.getTime() - 12 * 3600 * 1000;
  for (const t of venue.eventTemplates) {
    for (const i of t.instances) {
      if (!i.isCancelled && i.date.getTime() >= cutoff) return true;
    }
  }
  return false;
}

export async function loadPublicVenueForLineup(slug: string): Promise<PublicVenueForLineup | null> {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  let venue = await prisma.venue.findUnique({
    where: { slug },
    include: publicVenueLineupInclude,
  });
  if (!venue) return null;

  // Claimed / published recurring templates with no nights yet: materialize from real weekdays.
  const now = new Date();
  const venueOwnedPublic = venue.eventTemplates.filter((t) => !t.promoterNightId);
  if (venueOwnedPublic.length > 0 && !hasUpcomingInstance(venue, now)) {
    try {
      const result = await ensureVenueScheduleMaterialized(prisma, venue.id, { now });
      if (result.generatedInstanceCount > 0 || result.windowUpdated) {
        venue = await prisma.venue.findUnique({
          where: { slug },
          include: publicVenueLineupInclude,
        });
      }
    } catch (e) {
      console.error("[loadPublicVenueForLineup] ensure materialize failed", slug, e);
    }
  }

  return venue;
}
