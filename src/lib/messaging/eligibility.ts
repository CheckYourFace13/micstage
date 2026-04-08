import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Venue and musician may message each other only when they have an on-platform relationship:
 * active booking, tracked interest, or listed past venue.
 */
export async function canMusicianMessageVenue(
  prisma: PrismaClient,
  musicianId: string,
  venueId: string,
): Promise<boolean> {
  const [booking, interest, past] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        musicianId,
        cancelledAt: null,
        slot: { instance: { template: { venueId } } },
      },
      select: { id: true },
    }),
    prisma.musicianVenueInterest.findUnique({
      where: { musicianId_venueId: { musicianId, venueId } },
      select: { id: true },
    }),
    prisma.musicianPastVenue.findUnique({
      where: { musicianId_venueId: { musicianId, venueId } },
      select: { id: true },
    }),
  ]);
  return Boolean(booking || interest || past);
}

export async function assertCanMessagePair(
  prisma: PrismaClient,
  venueId: string,
  musicianId: string,
): Promise<void> {
  const ok = await canMusicianMessageVenue(prisma, musicianId, venueId);
  if (!ok) {
    throw new Error("Messaging is only available between artists and venues you are connected with on MicStage.");
  }
}

export type EligibleMusicianRow = { id: string; stageName: string; email: string };

/** Distinct musicians linked to this venue via booking, interest, or past venues. */
export async function loadEligibleMusiciansForVenue(
  prisma: PrismaClient,
  venueId: string,
): Promise<EligibleMusicianRow[]> {
  const [fromBookings, past, interest] = await Promise.all([
    prisma.booking.findMany({
      where: {
        musicianId: { not: null },
        cancelledAt: null,
        slot: { instance: { template: { venueId } } },
      },
      select: { musician: { select: { id: true, stageName: true, email: true } } },
    }),
    prisma.musicianPastVenue.findMany({
      where: { venueId },
      include: { musician: { select: { id: true, stageName: true, email: true } } },
    }),
    prisma.musicianVenueInterest.findMany({
      where: { venueId },
      include: { musician: { select: { id: true, stageName: true, email: true } } },
    }),
  ]);
  const map = new Map<string, EligibleMusicianRow>();
  for (const b of fromBookings) {
    if (b.musician) map.set(b.musician.id, b.musician);
  }
  for (const p of past) {
    map.set(p.musician.id, p.musician);
  }
  for (const i of interest) {
    map.set(i.musician.id, i.musician);
  }
  return [...map.values()].sort((a, b) => a.stageName.localeCompare(b.stageName));
}

export type EligibleVenueRow = { id: string; name: string; slug: string; city: string | null; region: string | null };

export async function loadEligibleVenuesForMusician(
  prisma: PrismaClient,
  musicianId: string,
): Promise<EligibleVenueRow[]> {
  const [fromBookings, past, interest] = await Promise.all([
    prisma.booking.findMany({
      where: {
        musicianId,
        cancelledAt: null,
      },
      select: {
        slot: {
          select: {
            instance: {
              select: {
                template: {
                  select: {
                    venue: { select: { id: true, name: true, slug: true, city: true, region: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.musicianPastVenue.findMany({
      where: { musicianId },
      include: { venue: { select: { id: true, name: true, slug: true, city: true, region: true } } },
    }),
    prisma.musicianVenueInterest.findMany({
      where: { musicianId },
      include: { venue: { select: { id: true, name: true, slug: true, city: true, region: true } } },
    }),
  ]);
  const map = new Map<string, EligibleVenueRow>();
  for (const b of fromBookings) {
    const v = b.slot?.instance?.template?.venue;
    if (v) map.set(v.id, { id: v.id, name: v.name, slug: v.slug, city: v.city, region: v.region });
  }
  for (const p of past) {
    const v = p.venue;
    map.set(v.id, v);
  }
  for (const i of interest) {
    const v = i.venue;
    map.set(v.id, v);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
