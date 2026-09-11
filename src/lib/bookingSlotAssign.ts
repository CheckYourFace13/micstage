import type { Prisma } from "@/generated/prisma/client";

export type SlotBookingRef = {
  id: string;
  cancelledAt: Date | null;
  musicianId?: string | null;
  performerName?: string;
  performerEmail?: string | null;
  notes?: string | null;
} | null;

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

/**
 * Place an active booking on a slot without hitting Booking.slotId unique conflicts.
 * If a cancelled booking still owns the slotId, reuse that row (preserves history id).
 * Never silently overwrites an active booking.
 */
export async function assignActiveBookingToSlot(
  tx: Prisma.TransactionClient,
  slotId: string,
  input: AssignBookingInput,
): Promise<{ bookingId: string; reusedCancelled: boolean }> {
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
    cancelledAt: null as Date | null,
    reminderEmail24hSentAt: null as Date | null,
    reminderEmail2hSentAt: null as Date | null,
  };

  if (slot.booking && slot.booking.cancelledAt) {
    await tx.booking.update({
      where: { id: slot.booking.id },
      data,
    });
    await tx.slot.update({
      where: { id: slotId },
      data: { status: "RESERVED", manualLineupLabel: null },
    });
    return { bookingId: slot.booking.id, reusedCancelled: true };
  }

  const created = await tx.booking.create({
    data: {
      slotId,
      ...data,
    },
  });
  await tx.slot.update({
    where: { id: slotId },
    data: { status: "RESERVED", manualLineupLabel: null },
  });
  return { bookingId: created.id, reusedCancelled: false };
}

/**
 * Soft-cancel the active booking on a slot and free it. Keeps the Booking row + slotId
 * (history) — rebooking must go through assignActiveBookingToSlot.
 */
export async function softCancelSlotBooking(
  tx: Prisma.TransactionClient,
  slotId: string,
): Promise<boolean> {
  const updated = await tx.booking.updateMany({
    where: { slotId, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  await tx.slot.update({
    where: { id: slotId },
    data: { status: "AVAILABLE", manualLineupLabel: null },
  });
  return updated.count > 0;
}

export type MoveBookingResult =
  | { ok: true; mode: "moved" | "swapped" }
  | { ok: false; reason: "missing" | "same_slot" | "source_empty" | "dest_taken" };

/**
 * Move an active booking to another slot on the same instance.
 * Destination empty/cancelled → move. Destination active + allowSwap → swap names.
 * Never changes slot startMin/endMin (schedule grid stays fixed).
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
    // Swap performer payloads in place — slot times untouched.
    const a = {
      musicianId: fromActive.musicianId ?? null,
      performerName: fromActive.performerName ?? "",
      performerEmail: fromActive.performerEmail ?? null,
      notes: fromActive.notes ?? null,
    };
    const b = {
      musicianId: toActive.musicianId ?? null,
      performerName: toActive.performerName ?? "",
      performerEmail: toActive.performerEmail ?? null,
      notes: toActive.notes ?? null,
    };
    await tx.booking.update({ where: { id: fromActive.id }, data: b });
    await tx.booking.update({ where: { id: toActive.id }, data: a });
    return { ok: true, mode: "swapped" };
  }

  // Move: cancel source, assign destination (reuse cancelled row if present).
  const payload = {
    musicianId: fromActive.musicianId ?? null,
    performerName: fromActive.performerName ?? "Performer",
    performerEmail: fromActive.performerEmail ?? null,
    notes: fromActive.notes ?? null,
  };
  await softCancelSlotBooking(tx, fromSlotId);
  await assignActiveBookingToSlot(tx, toSlotId, payload);
  return { ok: true, mode: "moved" };
}
