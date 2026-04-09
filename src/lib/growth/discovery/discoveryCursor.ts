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

export async function readDiscoveryCursorJson<T>(
  prisma: PrismaClient,
  adapterId: string,
  marketSlug: string,
  cursorKey: string,
): Promise<T | null> {
  const raw = await readDiscoveryCursor(prisma, adapterId, marketSlug, cursorKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeDiscoveryCursorJson(
  prisma: PrismaClient,
  adapterId: string,
  marketSlug: string,
  cursorKey: string,
  value: unknown,
): Promise<void> {
  await writeDiscoveryCursor(prisma, adapterId, marketSlug, cursorKey, JSON.stringify(value));
}
