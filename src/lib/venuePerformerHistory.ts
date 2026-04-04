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
      displayName: true,
      lastUsedAt: true,
      useCount: true,
      showOnPublicProfile: true,
      musicianId: true,
      linkedMusicianId: true,
    },
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
