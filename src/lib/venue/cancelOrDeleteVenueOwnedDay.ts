/**
 * Safe venue-owned open-mic day removal (EventInstances whose template has no
 * PromoterNight). Never touches Host-owned nights at the same venue/date.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { softCancelSlotBooking } from "@/lib/bookingSlotAssign";
import { notifyBookingCancelledById } from "@/lib/bookingNotify";

export type CancelOrDeleteVenueOwnedDayResult =
  | { ok: true; mode: "deleted"; instanceCount: number }
  | { ok: true; mode: "cancelled"; instanceCount: number; notifiedBookingIds: string[] }
  | { ok: false; reason: "no_instances" };

export async function cancelOrDeleteVenueOwnedDay(
  prisma: PrismaClient,
  venueId: string,
  dayStart: Date,
): Promise<CancelOrDeleteVenueOwnedDayResult> {
  const instances = await prisma.eventInstance.findMany({
    where: {
      date: dayStart,
      template: { venueId, promoterNightId: null },
    },
    include: {
      slots: {
        select: {
          id: true,
          booking: { select: { id: true, cancelledAt: true } },
          _count: { select: { bookingHistories: true } },
        },
      },
    },
  });

  if (instances.length === 0) return { ok: false, reason: "no_instances" };

  const activeBookingIds: string[] = [];
  let hasHistory = false;
  for (const inst of instances) {
    for (const slot of inst.slots) {
      if (slot._count.bookingHistories > 0) hasHistory = true;
      if (slot.booking) {
        if (slot.booking.cancelledAt == null) activeBookingIds.push(slot.booking.id);
        else hasHistory = true;
      }
    }
  }

  const mustPreserve = activeBookingIds.length > 0 || hasHistory;

  if (!mustPreserve) {
    await prisma.eventInstance.deleteMany({
      where: { id: { in: instances.map((i) => i.id) } },
    });
    return { ok: true, mode: "deleted", instanceCount: instances.length };
  }

  const cancelledBookingIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const bookingId of activeBookingIds) {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { slotId: true, cancelledAt: true },
      });
      if (!booking || booking.cancelledAt) continue;
      const did = await softCancelSlotBooking(tx, booking.slotId, "CANCELLED");
      if (did) cancelledBookingIds.push(bookingId);
    }
    await tx.eventInstance.updateMany({
      where: { id: { in: instances.map((i) => i.id) } },
      data: { isCancelled: true },
    });
  });

  const notifiedBookingIds: string[] = [];
  for (const bookingId of cancelledBookingIds) {
    try {
      await notifyBookingCancelledById(bookingId, "organizer");
      notifiedBookingIds.push(bookingId);
    } catch (e) {
      console.error("[cancelOrDeleteVenueOwnedDay] notify failed", {
        bookingId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    ok: true,
    mode: "cancelled",
    instanceCount: instances.length,
    notifiedBookingIds,
  };
}
