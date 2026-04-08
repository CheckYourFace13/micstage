import type { PrismaClient } from "@/generated/prisma/client";

export async function readDiscoveryCursor(
  prisma: PrismaClient,
  adapterId: string,
  marketSlug: string,
  cursorKey: string,
): Promise<string | null> {
  const row = await prisma.growthDiscoveryCursor.findUnique({
    where: {
      adapterId_marketSlug_cursorKey: { adapterId, marketSlug, cursorKey },
    },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function writeDiscoveryCursor(
  prisma: PrismaClient,
  adapterId: string,
  marketSlug: string,
  cursorKey: string,
  value: string,
): Promise<void> {
  await prisma.growthDiscoveryCursor.upsert({
    where: {
      adapterId_marketSlug_cursorKey: { adapterId, marketSlug, cursorKey },
    },
    create: { adapterId, marketSlug, cursorKey, value },
    update: { value },
  });
}
