import type { PrismaClient } from "@/generated/prisma/client";
import {
  acquireCronJobLease,
  CRON_LEASE_ENRICHMENT_TTL_MS,
} from "@/lib/growth/cronJobLease";

/** Row-lease ids (DiscoveryExecutionGuard) — session advisory locks fail under PgBouncer. */
export const SCHEDULE_ENRICH_LEASE_ID = "growth-schedule-enrich";
export const CONTACT_MINE_LEASE_ID = "growth-contact-mine";

/** @deprecated Prefer lease ids; kept for older callers/tests. */
export const SCHEDULE_ENRICH_LOCK = { k1: 54_788_914, k2: 20_993_313 } as const;
/** @deprecated Prefer lease ids; kept for older callers/tests. */
export const CONTACT_MINE_LOCK = { k1: 54_788_915, k2: 20_993_314 } as const;

export async function withPgAdvisoryLock<T>(
  prisma: PrismaClient,
  lock: { k1: number; k2: number },
  empty: T,
  run: () => Promise<T>,
): Promise<T> {
  const leaseId =
    lock.k1 === SCHEDULE_ENRICH_LOCK.k1
      ? SCHEDULE_ENRICH_LEASE_ID
      : lock.k1 === CONTACT_MINE_LOCK.k1
        ? CONTACT_MINE_LEASE_ID
        : `growth-lock-${lock.k1}-${lock.k2}`;
  const lease = await acquireCronJobLease(prisma, {
    leaseId,
    requestId: `enrich-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ttlMs: CRON_LEASE_ENRICHMENT_TTL_MS,
  });
  if (lease.status === "already_running") return empty;
  try {
    return await run();
  } finally {
    await lease.release();
  }
}
