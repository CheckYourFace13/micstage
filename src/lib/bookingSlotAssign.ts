import type { Prisma } from "@/generated/prisma/client";

export type SlotBookingRef = {
  id: string;
  cancelledAt: Date | null;
  createdAt?: Date;
  musicianId?: string | null;
  performerName?: string;
  performerEmail?: string | null;
  notes?: string | null;
  reminderEmail24hSentAt?: Date | null;
  reminderEmail2hSentAt?: Date | null;
} | null;

export type BookingHistoryReason = "CANCELLED" | "SUPERSEDED" | "MOVED_AWAY";

/** True when the slot can accept a new assignment (empty or only a cancelled booking). */
export function slotIsOpenForAssignment(booking: SlotBookingRef): boolean {
  return !booking || booking.cancelledAt != null;
}

export function activeBookingFrom(booking: SlotBookingRef) {
  return booking && booking.cancelledAt == null ? booking : null;
}

export type AssignBookingInput = {
  musicianId?: string | null;
  performerName: string;
  performerEmail?: string | null;
  notes?: string | null;
};

async function snapshotBookingHistory(
  tx: Prisma.TransactionClient,
  booking: {
    id: string;
    slotId: string;
    createdAt: Date;
    cancelledAt: Date | null;
    musicianId: string | null;
    performerName: string;
    performerEmail: string | null;
    notes: string | null;
  },
  reason: BookingHistoryReason,
) {
  // Avoid duplicate CANCELLED snapshots for the same booking+cancel instant.
  if (reason === "CANCELLED" && booking.cancelledAt) {
    const existing = await tx.bookingHistory.findFirst({
      where: {
        bookingId: booking.id,
        reason: "CANCELLED",
        cancelledAt: booking.cancelledAt,
      },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const row = await tx.bookingHistory.create({
    data: {
      slotId: booking.slotId,
      bookingId: booking.id,
      musicianId: booking.musicianId,
      performerName: booking.performerName,
      performerEmail: booking.performerEmail,
      notes: booking.notes,
      bookedAt: booking.createdAt,
      cancelledAt: booking.cancelledAt,
      reason,
    },
  });
  return row.id;
}

/**
 * Place an active booking on a slot without hitting Booking.slotId unique conflicts.
 * If a cancelled booking still owns the slotId: snapshot it to BookingHistory, delete it,
 * then create a fresh Booking (new createdAt / reminder state). Never overwrites history.
 */
export async function assignActiveBookingToSlot(
  tx: Prisma.TransactionClient,
  slotId: string,
  input: AssignBookingInput,
): Promise<{ bookingId: string; replacedCancelled: boolean }> {
  const slot = await tx.slot.findUnique({
    where: { id: slotId },
    include: { booking: true },
  });
  if (!slot) throw new Error("SLOT_MISSING");
  if (slot.booking && slot.booking.cancelledAt == null) throw new Error("SLOT_TAKEN");

  const data = {
    musicianId: input.musicianId ?? null,
    performerName: input.performerName.slice(0, 120),
    performerEmail: input.performerEmail?.slice(0, 200) ?? null,
    notes: input.notes ?? null,
  };

  const hadCancelled = Boolean(slot.booking?.cancelledAt);

  if (slot.booking && slot.booking.cancelledAt) {
    await snapshotBookingHistory(
      tx,
      {
        id: slot.booking.id,
        slotId,
        createdAt: slot.booking.createdAt,
        cancelledAt: slot.booking.cancelledAt,
        musicianId: slot.booking.musicianId,
        performerName: slot.booking.performerName,
        performerEmail: slot.booking.performerEmail,
        notes: slot.booking.notes,
      },
      "SUPERSEDED",
    );
    await tx.booking.delete({ where: { id: slot.booking.id } });
  }

  const created = await tx.booking.create({
    data: {
      slotId,
      ...data,
      cancelledAt: null,
      reminderEmail24hSentAt: null,
      reminderEmail2hSentAt: null,
    },
  });
  await tx.slot.update({
    where: { id: slotId },
    data: { status: "RESERVED", manualLineupLabel: null },
  });
  return { bookingId: created.id, replacedCancelled: hadCancelled };
}

/**
 * Soft-cancel the active booking and free the slot. Snapshots history first.
 */
export async function softCancelSlotBooking(
  tx: Prisma.TransactionClient,
  slotId: string,
  reason: BookingHistoryReason = "CANCELLED",
): Promise<boolean> {
  const slot = await tx.slot.findUnique({
    where: { id: slotId },
    include: { booking: true },
  });
  if (!slot?.booking || slot.booking.cancelledAt != null) {
    await tx.slot.update({
      where: { id: slotId },
      data: { status: "AVAILABLE", manualLineupLabel: null },
    });
    return false;
  }

  const cancelledAt = new Date();
  await tx.booking.update({
    where: { id: slot.booking.id },
    data: { cancelledAt },
  });
  await snapshotBookingHistory(
    tx,
    {
      id: slot.booking.id,
      slotId,
      createdAt: slot.booking.createdAt,
      cancelledAt,
      musicianId: slot.booking.musicianId,
      performerName: slot.booking.performerName,
      performerEmail: slot.booking.performerEmail,
      notes: slot.booking.notes,
    },
    reason,
  );
  await tx.slot.update({
    where: { id: slotId },
    data: { status: "AVAILABLE", manualLineupLabel: null },
  });
  return true;
}

export type MoveBookingResult =
  | {
      ok: true;
      mode: "moved" | "swapped";
      /** Performers whose start time changed — reminders cleared; notify these. */
      notify: Array<{
        performerName: string;
        performerEmail: string | null;
        fromStartMin: number;
        toStartMin: number;
      }>;
    }
  | { ok: false; reason: "missing" | "same_slot" | "source_empty" | "dest_taken" };

/**
 * Move an active booking to another slot on the same instance.
 * Destination empty/cancelled → move (history + fresh booking; reminders reset).
 * Destination active + allowSwap → swap payloads and clear reminder flags on both.
 * Never changes slot startMin/endMin.
 */
export async function moveOrSwapBookingBetweenSlots(
  tx: Prisma.TransactionClient,
  fromSlotId: string,
  toSlotId: string,
  opts: { allowSwap: boolean },
): Promise<MoveBookingResult> {
  if (fromSlotId === toSlotId) return { ok: false, reason: "same_slot" };

  const [from, to] = await Promise.all([
    tx.slot.findUnique({ where: { id: fromSlotId }, include: { booking: true } }),
    tx.slot.findUnique({ where: { id: toSlotId }, include: { booking: true } }),
  ]);
  if (!from || !to) return { ok: false, reason: "missing" };
  if (from.instanceId !== to.instanceId) return { ok: false, reason: "missing" };

  const fromActive = activeBookingFrom(from.booking);
  if (!fromActive) return { ok: false, reason: "source_empty" };

  const toActive = activeBookingFrom(to.booking);
  if (toActive && !opts.allowSwap) return { ok: false, reason: "dest_taken" };

  if (toActive) {
    const a = {
      musicianId: fromActive.musicianId ?? null,
      performerName: fromActive.performerName ?? "",
      performerEmail: fromActive.performerEmail ?? null,
      notes: fromActive.notes ?? null,
      // New start times → reminders must re-evaluate for each performer.
      reminderEmail24hSentAt: null as Date | null,
      reminderEmail2hSentAt: null as Date | null,
    };
    const b = {
      musicianId: toActive.musicianId ?? null,
      performerName: toActive.performerName ?? "",
      performerEmail: toActive.performerEmail ?? null,
      notes: toActive.notes ?? null,
      reminderEmail24hSentAt: null as Date | null,
      reminderEmail2hSentAt: null as Date | null,
    };
    await tx.booking.update({ where: { id: fromActive.id }, data: b });
    await tx.booking.update({ where: { id: toActive.id }, data: a });
    return {
      ok: true,
      mode: "swapped",
      notify: [
        {
          performerName: a.performerName,
          performerEmail: a.performerEmail,
          fromStartMin: from.startMin,
          toStartMin: to.startMin,
        },
        {
          performerName: b.performerName,
          performerEmail: b.performerEmail,
          fromStartMin: to.startMin,
          toStartMin: from.startMin,
        },
      ],
    };
  }

  const payload = {
    musicianId: fromActive.musicianId ?? null,
    performerName: fromActive.performerName ?? "Performer",
    performerEmail: fromActive.performerEmail ?? null,
    notes: fromActive.notes ?? null,
  };
  await softCancelSlotBooking(tx, fromSlotId, "MOVED_AWAY");
  await assignActiveBookingToSlot(tx, toSlotId, payload);
  return {
    ok: true,
    mode: "moved",
    notify: [
      {
        performerName: payload.performerName,
        performerEmail: payload.performerEmail,
        fromStartMin: from.startMin,
        toStartMin: to.startMin,
      },
    ],
  };
}
