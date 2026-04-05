import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { VenuePerformerHistoryKind } from "@/generated/prisma/client";

const MANUAL_KEY_MAX = 200;

export function normalizeManualPerformerKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, MANUAL_KEY_MAX);
}

type Tx = Prisma.TransactionClient;

export async function touchVenuePerformerHistoryForMusician(tx: Tx, venueId: string, musicianId: string): Promise<void> {
  const m = await tx.musicianUser.findUnique({
    where: { id: musicianId },
    select: { stageName: true },
  });
  if (!m) return;
  const displayName = m.stageName.trim() || "Artist";
  await tx.venuePerformerHistory.upsert({
    where: {
      venueId_kind_key: {
        venueId,
        kind: VenuePerformerHistoryKind.MUSICIAN,
        key: musicianId,
      },
    },
    create: {
      venueId,
      kind: VenuePerformerHistoryKind.MUSICIAN,
      key: musicianId,
      musicianId,
      displayName,
      lastUsedAt: new Date(),
      useCount: 1,
      showOnPublicProfile: true,
    },
    update: {
      displayName,
      musicianId,
      lastUsedAt: new Date(),
      useCount: { increment: 1 },
    },
  });
}

/**
 * Reverses `touchVenuePerformerHistoryForMusician` by `delta` uses (test cleanup).
 * Deletes the row when useCount would drop to 0 or below.
 */
export async function decrementVenuePerformerHistoryMusicianUses(
  tx: Tx,
  venueId: string,
  musicianId: string,
  delta: number,
): Promise<"deleted" | "decremented" | "noop"> {
  if (delta <= 0) return "noop";
  const row = await tx.venuePerformerHistory.findUnique({
    where: {
      venueId_kind_key: {
        venueId,
        kind: VenuePerformerHistoryKind.MUSICIAN,
        key: musicianId,
      },
    },
    select: { id: true, useCount: true },
  });
  if (!row) return "noop";
  const next = row.useCount - delta;
  if (next <= 0) {
    await tx.venuePerformerHistory.delete({ where: { id: row.id } });
    return "deleted";
  }
  await tx.venuePerformerHistory.update({
    where: { id: row.id },
    data: { useCount: next },
  });
  return "decremented";
}

/**
 * Reverses `touchVenuePerformerHistoryForManual` by `delta` uses (test cleanup).
 */
export async function decrementVenuePerformerHistoryManualUses(
  tx: Tx,
  venueId: string,
  normalizedKey: string,
  delta: number,
): Promise<"deleted" | "decremented" | "noop"> {
  if (delta <= 0 || !normalizedKey) return "noop";
  const row = await tx.venuePerformerHistory.findUnique({
    where: {
      venueId_kind_key: {
        venueId,
        kind: VenuePerformerHistoryKind.MANUAL,
        key: normalizedKey,
      },
    },
    select: { id: true, useCount: true },
  });
  if (!row) return "noop";
  const next = row.useCount - delta;
  if (next <= 0) {
    await tx.venuePerformerHistory.delete({ where: { id: row.id } });
    return "deleted";
  }
  await tx.venuePerformerHistory.update({
    where: { id: row.id },
    data: { useCount: next },
  });
  return "decremented";
}

export async function touchVenuePerformerHistoryForManual(tx: Tx, venueId: string, manualName: string): Promise<void> {
  const display = manualName.trim();
  const key = normalizeManualPerformerKey(manualName);
  if (!key) return;
  await tx.venuePerformerHistory.upsert({
    where: {
      venueId_kind_key: {
        venueId,
        kind: VenuePerformerHistoryKind.MANUAL,
        key,
      },
    },
    create: {
      venueId,
      kind: VenuePerformerHistoryKind.MANUAL,
      key,
      displayName: display || manualName,
      lastUsedAt: new Date(),
      useCount: 1,
      showOnPublicProfile: true,
    },
    update: {
      displayName: display || manualName,
      lastUsedAt: new Date(),
      useCount: { increment: 1 },
    },
  });
}

/** Top recent performers at this venue for slot autocomplete (linked + manual). */
export async function loadVenuePerformerSuggestions(
  prisma: Pick<PrismaClient, "venuePerformerHistory">,
  venueId: string,
  take = 40,
): Promise<{ id: string | null; stageName: string; kind: VenuePerformerHistoryKind }[]> {
  const rows = await prisma.venuePerformerHistory.findMany({
    where: { venueId },
    orderBy: [{ lastUsedAt: "desc" }, { useCount: "desc" }],
    take,
    select: {
      kind: true,
      displayName: true,
      musicianId: true,
    },
  });
  return rows.map((r) => ({
    id: r.musicianId,
    stageName: r.displayName.trim(),
    kind: r.kind,
  }));
}

export async function loadVenuePerformerHistoryForDashboard(prisma: PrismaClient, venueId: string, take = 80) {
  return prisma.venuePerformerHistory.findMany({
    where: { venueId },
    orderBy: [{ lastUsedAt: "desc" }],
    take,
    select: {
      id: true,
      kind: true,
      key: true,
      displayName: true,
      lastUsedAt: true,
      useCount: true,
      showOnPublicProfile: true,
      musicianId: true,
      linkedMusicianId: true,
    },
  });
}

const bookingVenueSelect = {
  id: true,
  musicianId: true,
  performerName: true,
  slot: {
    select: {
      instance: {
        select: {
          date: true,
          template: { select: { venue: { select: { id: true, name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.BookingSelect;

type BookingVenueRow = Prisma.BookingGetPayload<{ select: typeof bookingVenueSelect }>;

export type PerformerHistoryEvent = {
  date: Date;
  venueId: string;
  venueName: string;
};

export type VenuePerformerHistoryDashboardEnrichedRow = {
  id: string;
  kind: VenuePerformerHistoryKind;
  key: string;
  displayName: string;
  showOnPublicProfile: boolean;
  musicianId: string | null;
  linkedMusicianId: string | null;
  /** Account used for MicStage-wide booking stats and timeline (musician row or manual-linked account). */
  effectiveMusicianId: string | null;
  /** Public artist search deep link (same pattern as the venue’s public page). */
  performerPublicHref: string | null;
  lastPerformanceAtThisVenue: Date | null;
  performancesHere: number;
  /** Non-cancelled MicStage bookings across all venues; null if no artist account is linked. */
  totalPerformancesAllVenues: number | null;
  /** Newest first. */
  performanceTimeline: PerformerHistoryEvent[];
};

function bookingToEvent(b: BookingVenueRow): PerformerHistoryEvent | null {
  const inst = b.slot?.instance;
  if (!inst) return null;
  const v = inst.template.venue;
  return { date: inst.date, venueId: v.id, venueName: v.name };
}

function mergeUniqueBookings(lists: BookingVenueRow[][]): BookingVenueRow[] {
  const seen = new Set<string>();
  const out: BookingVenueRow[] = [];
  for (const list of lists) {
    for (const b of list) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}

/**
 * Dashboard “Previous performers” table: ties history rows to real Booking rows at this venue
 * and (when an artist account is known) global booking counts + full performance timeline.
 */
export async function loadVenuePerformerHistoryDashboardEnriched(
  prisma: PrismaClient,
  venueId: string,
  take = 80,
): Promise<VenuePerformerHistoryDashboardEnrichedRow[]> {
  const historyRows = await loadVenuePerformerHistoryForDashboard(prisma, venueId, take);

  const [venueBookings, musicianIds] = await Promise.all([
    prisma.booking.findMany({
      where: {
        cancelledAt: null,
        slot: { instance: { template: { venueId } } },
      },
      select: bookingVenueSelect,
    }),
    (async () => {
      const ids = new Set<string>();
      for (const r of historyRows) {
        if (r.musicianId) ids.add(r.musicianId);
        if (r.linkedMusicianId) ids.add(r.linkedMusicianId);
      }
      return [...ids];
    })(),
  ]);

  const globalBookings =
    musicianIds.length > 0
      ? await prisma.booking.findMany({
          where: { cancelledAt: null, musicianId: { in: musicianIds } },
          select: bookingVenueSelect,
        })
      : [];

  const stageRows =
    musicianIds.length > 0
      ? await prisma.musicianUser.findMany({
          where: { id: { in: musicianIds } },
          select: { id: true, stageName: true },
        })
      : [];
  const stageById: Record<string, string> = Object.fromEntries(
    stageRows.map((m) => [m.id, m.stageName.trim() || "Artist"]),
  );

  const atVenueByMusician = new Map<string, BookingVenueRow[]>();
  const atVenueByManualKey = new Map<string, BookingVenueRow[]>();
  for (const b of venueBookings) {
    if (b.musicianId) {
      const arr = atVenueByMusician.get(b.musicianId) ?? [];
      arr.push(b);
      atVenueByMusician.set(b.musicianId, arr);
    } else {
      const k = normalizeManualPerformerKey(b.performerName);
      if (!k) continue;
      const arr = atVenueByManualKey.get(k) ?? [];
      arr.push(b);
      atVenueByManualKey.set(k, arr);
    }
  }

  const globalByMusician = new Map<string, BookingVenueRow[]>();
  for (const b of globalBookings) {
    if (!b.musicianId) continue;
    const arr = globalByMusician.get(b.musicianId) ?? [];
    arr.push(b);
    globalByMusician.set(b.musicianId, arr);
  }

  return historyRows.map((r) => {
    const effectiveMusicianId = r.musicianId ?? r.linkedMusicianId;

    let hereBookings: BookingVenueRow[] = [];
    if (r.kind === VenuePerformerHistoryKind.MUSICIAN && r.musicianId) {
      hereBookings = atVenueByMusician.get(r.musicianId) ?? [];
    } else if (r.kind === VenuePerformerHistoryKind.MANUAL) {
      const byName = atVenueByManualKey.get(r.key) ?? [];
      const byLink = r.linkedMusicianId ? (atVenueByMusician.get(r.linkedMusicianId) ?? []) : [];
      hereBookings = mergeUniqueBookings([byName, byLink]);
    }

    const hereDates = hereBookings.map((b) => bookingToEvent(b)?.date).filter((d): d is Date => !!d);
    const lastPerformanceAtThisVenue =
      hereDates.length > 0 ? new Date(Math.max(...hereDates.map((d) => d.getTime()))) : null;

    let performanceTimeline: PerformerHistoryEvent[] = [];
    let totalPerformancesAllVenues: number | null = null;

    if (effectiveMusicianId) {
      const gb = globalByMusician.get(effectiveMusicianId) ?? [];
      totalPerformancesAllVenues = gb.length;
      const events = gb.map((b) => bookingToEvent(b)).filter((e): e is PerformerHistoryEvent => !!e);
      events.sort((a, b) => b.date.getTime() - a.date.getTime());
      performanceTimeline = events;
    } else {
      const events = hereBookings.map((b) => bookingToEvent(b)).filter((e): e is PerformerHistoryEvent => !!e);
      events.sort((a, b) => b.date.getTime() - a.date.getTime());
      performanceTimeline = events;
    }

    const performerPublicHref =
      effectiveMusicianId != null
        ? `/performers?q=${encodeURIComponent(stageById[effectiveMusicianId] ?? r.displayName)}`
        : null;

    return {
      id: r.id,
      kind: r.kind,
      key: r.key,
      displayName: r.displayName,
      showOnPublicProfile: r.showOnPublicProfile,
      musicianId: r.musicianId,
      linkedMusicianId: r.linkedMusicianId,
      effectiveMusicianId,
      performerPublicHref,
      lastPerformanceAtThisVenue,
      performancesHere: hereBookings.length,
      totalPerformancesAllVenues,
      performanceTimeline,
    };
  });
}

/** Public “past performers” strip — respects showOnPublicProfile (manual rows can be hidden by the venue). */
export async function loadPublicVenuePastPerformers(prisma: PrismaClient, venueId: string, take = 24) {
  return prisma.venuePerformerHistory.findMany({
    where: { venueId, showOnPublicProfile: true },
    orderBy: { lastUsedAt: "desc" },
    take,
    select: {
      kind: true,
      displayName: true,
      musicianId: true,
      linkedMusicianId: true,
    },
  });
}
