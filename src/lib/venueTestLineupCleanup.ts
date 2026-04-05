import type { PrismaClient } from "@/generated/prisma/client";
import {
  decrementVenuePerformerHistoryManualUses,
  decrementVenuePerformerHistoryMusicianUses,
  normalizeManualPerformerKey,
} from "@/lib/venuePerformerHistory";
import { storageYmdUtc } from "@/lib/venuePublicLineup";

export type VenueLineupCleanupScope = "selected_day" | "entire_venue";

export type VenueLineupCleanupResult = {
  scope: VenueLineupCleanupScope;
  dateYmd: string | null;
  instanceCount: number;
  slotCount: number;
  bookingsDeleted: number;
  slotsManualLabelCleared: number;
  slotsReservedResetToAvailable: number;
  performerHistoryRowsDeleted: number;
  performerHistoryRowsDecremented: number;
};

function addCount(m: Map<string, number>, key: string, n: number) {
  if (n <= 0) return;
  m.set(key, (m.get(key) ?? 0) + n);
}

/**
 * Destructive test cleanup: removes bookings and manual labels for scoped slots,
 * resets RESERVED→AVAILABLE where appropriate, and reverses venue performer history
 * touches (decrement/delete by collected counts). Does not delete MusicianUser, Venue,
 * templates, instances, or slot rows.
 */
export async function runVenueLineupTestCleanup(
  prisma: PrismaClient,
  input: {
    venueId: string;
    scope: VenueLineupCleanupScope;
    /** Required when scope is selected_day (YYYY-MM-DD storage). */
    dateYmd: string | null;
  },
): Promise<VenueLineupCleanupResult> {
  const { venueId, scope, dateYmd } = input;

  const templates = await prisma.eventTemplate.findMany({
    where: { venueId },
    select: { id: true },
  });
  const templateIds = templates.map((t) => t.id);
  if (templateIds.length === 0) {
    return {
      scope,
      dateYmd,
      instanceCount: 0,
      slotCount: 0,
      bookingsDeleted: 0,
      slotsManualLabelCleared: 0,
      slotsReservedResetToAvailable: 0,
      performerHistoryRowsDeleted: 0,
      performerHistoryRowsDecremented: 0,
    };
  }

  const allInstances = await prisma.eventInstance.findMany({
    where: { templateId: { in: templateIds } },
    select: { id: true, date: true },
  });

  const instances =
    scope === "entire_venue"
      ? allInstances
      : allInstances.filter((i) => dateYmd && storageYmdUtc(i.date) === dateYmd);

  const instanceIds = instances.map((i) => i.id);
  if (instanceIds.length === 0) {
    return {
      scope,
      dateYmd,
      instanceCount: 0,
      slotCount: 0,
      bookingsDeleted: 0,
      slotsManualLabelCleared: 0,
      slotsReservedResetToAvailable: 0,
      performerHistoryRowsDeleted: 0,
      performerHistoryRowsDecremented: 0,
    };
  }

  const slots = await prisma.slot.findMany({
    where: { instanceId: { in: instanceIds } },
    include: { booking: true },
  });

  const musicianDeltas = new Map<string, number>();
  const manualKeyDeltas = new Map<string, number>();

  let bookingsDeleted = 0;
  let slotsManualLabelCleared = 0;
  let slotsReservedResetToAvailable = 0;
  let performerHistoryRowsDeleted = 0;
  let performerHistoryRowsDecremented = 0;

  for (const s of slots) {
    if (s.manualLineupLabel?.trim()) {
      const k = normalizeManualPerformerKey(s.manualLineupLabel);
      if (k) addCount(manualKeyDeltas, k, 1);
    }
    const b = s.booking;
    if (b) {
      if (b.musicianId) {
        addCount(musicianDeltas, b.musicianId, 1);
      } else {
        const k = normalizeManualPerformerKey(b.performerName);
        if (k) addCount(manualKeyDeltas, k, 1);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    const slotIds = slots.map((s) => s.id);
    const del = await tx.booking.deleteMany({ where: { slotId: { in: slotIds } } });
    bookingsDeleted = del.count;

    for (const s of slots) {
      const hadManual = Boolean(s.manualLineupLabel?.trim());
      const shouldFree = s.status === "RESERVED";

      await tx.slot.update({
        where: { id: s.id },
        data: {
          manualLineupLabel: null,
          ...(shouldFree ? { status: "AVAILABLE" as const } : {}),
        },
      });

      if (hadManual) slotsManualLabelCleared++;
      if (shouldFree) slotsReservedResetToAvailable++;
    }

    for (const [musicianId, delta] of musicianDeltas) {
      const out = await decrementVenuePerformerHistoryMusicianUses(tx, venueId, musicianId, delta);
      if (out === "deleted") performerHistoryRowsDeleted++;
      else if (out === "decremented") performerHistoryRowsDecremented++;
    }

    for (const [key, delta] of manualKeyDeltas) {
      const out = await decrementVenuePerformerHistoryManualUses(tx, venueId, key, delta);
      if (out === "deleted") performerHistoryRowsDeleted++;
      else if (out === "decremented") performerHistoryRowsDecremented++;
    }
  });

  return {
    scope,
    dateYmd,
    instanceCount: instances.length,
    slotCount: slots.length,
    bookingsDeleted,
    slotsManualLabelCleared,
    slotsReservedResetToAvailable,
    performerHistoryRowsDeleted,
    performerHistoryRowsDecremented,
  };
}

export function isVenueLineupTestCleanupUiEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VENUE_ALLOW_LINEUP_TEST_CLEANUP === "true";
}
