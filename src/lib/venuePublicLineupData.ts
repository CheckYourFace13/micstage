import { getPrismaOrNull } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Public templates with enough upcoming instances for lineup + date navigation. */
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

export async function loadPublicVenueForLineup(slug: string): Promise<PublicVenueForLineup | null> {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    return await prisma.venue.findUnique({
      where: { slug },
      include: publicVenueLineupInclude,
    });
  } catch {
    return null;
  }
}
