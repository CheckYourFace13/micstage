/**
 * Host event rights: manage lineup/signup for nights they own.
 * Does NOT grant venue profile management.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export async function assertHostOwnsNight(
  prisma: PrismaClient,
  promoterId: string,
  nightId: string,
): Promise<{ ok: true; nightId: string; seriesId: string; venueId: string } | { ok: false }> {
  const night = await prisma.promoterNight.findFirst({
    where: { id: nightId, series: { promoterId } },
    select: { id: true, seriesId: true, venueId: true },
  });
  if (!night) return { ok: false };
  return { ok: true, nightId: night.id, seriesId: night.seriesId, venueId: night.venueId };
}

export async function assertHostOwnsSlot(
  prisma: PrismaClient,
  promoterId: string,
  slotId: string,
): Promise<{ ok: true; nightId: string } | { ok: false }> {
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    select: {
      instance: {
        select: {
          template: {
            select: {
              promoterNightId: true,
              promoterNight: { select: { series: { select: { promoterId: true } } } },
            },
          },
        },
      },
    },
  });
  const nightId = slot?.instance.template.promoterNightId;
  const ownerId = slot?.instance.template.promoterNight?.series.promoterId;
  if (!nightId || ownerId !== promoterId) return { ok: false };
  return { ok: true, nightId };
}
