import type { PrismaClient } from "@/generated/prisma/client";

/** Session-scoped locks so tick + offset enrichment never double-write the same workers. */
export const SCHEDULE_ENRICH_LOCK = { k1: 54_788_914, k2: 20_993_313 } as const;
export const CONTACT_MINE_LOCK = { k1: 54_788_915, k2: 20_993_314 } as const;

export async function withPgAdvisoryLock<T>(
  prisma: PrismaClient,
  lock: { k1: number; k2: number },
  empty: T,
  run: () => Promise<T>,
): Promise<T> {
  const rows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT pg_try_advisory_lock(${lock.k1}, ${lock.k2}) AS locked`,
  );
  if (!rows[0]?.locked) return empty;
  try {
    return await run();
  } finally {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${lock.k1}, ${lock.k2})`);
  }
}
