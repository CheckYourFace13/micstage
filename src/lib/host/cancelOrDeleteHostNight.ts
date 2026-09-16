/**
 * Safe Host night removal: hard-delete empty nights; cancel nights that have
 * bookings/history (preserve BookingHistory, notify active performers once).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { softCancelSlotBooking } from "@/lib/bookingSlotAssign";
import { notifyBookingCancelledById } from "@/lib/bookingNotify";

export type CancelOrDeleteHostNightResult =
  | { ok: true; mode: "deleted" }
  | { ok: true; mode: "cancelled"; notifiedBookingIds: string[] }
  | { ok: false; reason: "not_found" | "forbidden" | "already_cancelled" };

async function nightBookingFootprint(
  prisma: PrismaClient,
  nightId: string,
): Promise<{
  activeBookingIds: string[];
  hasHistory: boolean;
  instanceIds: string[];
}> {
  const template = await prisma.eventTemplate.findUnique({
    where: { promoterNightId: nightId },
    select: {
      instances: {
        select: {
          id: true,
          slots: {
            select: {
              id: true,
              booking: { select: { id: true, cancelledAt: true } },
              _count: { select: { bookingHistories: true } },
            },
          },
        },
      },
    },
  });

  const activeBookingIds: string[] = [];
  let hasHistory = false;
  const instanceIds: string[] = [];

  for (const inst of template?.instances ?? []) {
    instanceIds.push(inst.id);
    for (const slot of inst.slots) {
      if (slot._count.bookingHistories > 0) hasHistory = true;
      if (slot.booking) {
        if (slot.booking.cancelledAt == null) activeBookingIds.push(slot.booking.id);
        else hasHistory = true;
      }
    }
  }

  return { activeBookingIds, hasHistory, instanceIds };
}

/**
 * Caller must already have verified host ownership of `nightId`.
 */
export async function cancelOrDeleteHostNight(
  prisma: PrismaClient,
  nightId: string,
): Promise<CancelOrDeleteHostNightResult> {
  const night = await prisma.promoterNight.findUnique({
    where: { id: nightId },
    select: { id: true, cancelledAt: true },
  });
  if (!night) return { ok: false, reason: "not_found" };
  if (night.cancelledAt) return { ok: false, reason: "already_cancelled" };

  const footprint = await nightBookingFootprint(prisma, nightId);
  const mustPreserve = footprint.activeBookingIds.length > 0 || footprint.hasHistory;

  if (!mustPreserve) {
    await prisma.promoterNight.delete({ where: { id: nightId } });
    return { ok: true, mode: "deleted" };
  }

  const cancelledBookingIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const bookingId of footprint.activeBookingIds) {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { slotId: true, cancelledAt: true },
      });
      if (!booking || booking.cancelledAt) continue;
      const did = await softCancelSlotBooking(tx, booking.slotId, "CANCELLED");
      if (did) cancelledBookingIds.push(bookingId);
    }

    if (footprint.instanceIds.length > 0) {
      await tx.eventInstance.updateMany({
        where: { id: { in: footprint.instanceIds } },
        data: { isCancelled: true },
      });
    }

    await tx.promoterNight.update({
      where: { id: nightId },
      data: { cancelledAt: new Date(), signupEnabled: false },
    });

    const tpl = await tx.eventTemplate.findUnique({
      where: { promoterNightId: nightId },
      select: { id: true },
    });
    if (tpl) {
      await tx.eventTemplate.update({
        where: { id: tpl.id },
        data: { isPublic: false, bookingRestrictionMode: "HOUSE_ONLY" },
      });
    }
  });

  const notifiedBookingIds: string[] = [];
  for (const bookingId of cancelledBookingIds) {
    try {
      await notifyBookingCancelledById(bookingId, "organizer");
      notifiedBookingIds.push(bookingId);
    } catch (e) {
      console.error("[cancelOrDeleteHostNight] notify failed", {
        bookingId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: true, mode: "cancelled", notifiedBookingIds };
}
