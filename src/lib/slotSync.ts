import type { Prisma } from "@/generated/prisma/client";
import type { SlotSpec } from "@/lib/slotGeneration";

type SlotWithBooking = {
  id: string;
  startMin: number;
  endMin: number;
  status: string;
  booking: { cancelledAt: Date | null } | null;
};

/** True if this slot must not be reshaped or removed (active booking / artist hold). */
export function slotHasActiveBooking(slot: SlotWithBooking): boolean {
  // RESERVED first: never reshape or delete even if booking row is missing (stale safety).
  if (slot.status === "RESERVED") return true;
  if (slot.booking && slot.booking.cancelledAt == null) return true;
  return false;
}

/** Slots with any booking row or non-AVAILABLE status are kept as-is for safety. */
export function slotMayBeDeleted(slot: SlotWithBooking): boolean {
  if (slot.booking) return false;
  if (slot.status !== "AVAILABLE") return false;
  return true;
}

export function slotMayUpdateTiming(slot: SlotWithBooking): boolean {
  return !slotHasActiveBooking(slot);
}

export type SlotSyncStats = { created: number; updated: number; skippedProtected: number; deleted: number };

/**
 * Aligns DB slots with `desired` without touching booked/reserved slots.
 * - Creates missing start times as AVAILABLE.
 * - Updates endMin only for unbooked AVAILABLE slots.
 * - Deletes only AVAILABLE slots with no booking row that are no longer in the grid.
 */
export async function syncSlotsForInstance(
  tx: Prisma.TransactionClient,
  instanceId: string,
  desired: SlotSpec[],
): Promise<SlotSyncStats> {
  const existing = await tx.slot.findMany({
    where: { instanceId },
    include: { booking: true },
  });

  const stats: SlotSyncStats = { created: 0, updated: 0, skippedProtected: 0, deleted: 0 };
  const desiredStarts = new Set(desired.map((d) => d.startMin));

  for (const spec of desired) {
    const row = existing.find((e) => e.startMin === spec.startMin);
    if (!row) {
      await tx.slot.create({
        data: {
          instanceId,
          startMin: spec.startMin,
          endMin: spec.endMin,
          status: "AVAILABLE",
        },
      });
      stats.created++;
      continue;
    }
    if (!slotMayUpdateTiming(row)) {
      stats.skippedProtected++;
      continue;
    }
    if (row.endMin !== spec.endMin) {
      await tx.slot.update({
        where: { id: row.id },
        data: { endMin: spec.endMin },
      });
      stats.updated++;
    }
  }

  for (const row of existing) {
    if (desiredStarts.has(row.startMin)) continue;
    if (!slotMayBeDeleted(row)) continue;
    await tx.slot.delete({ where: { id: row.id } });
    stats.deleted++;
  }

  return stats;
}
