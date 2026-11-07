import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Row-lease single-flight for MicStage cron phases.
 * Reuses DiscoveryExecutionGuard (id PK) so no migration is required.
 * Prefer this over session `pg_try_advisory_lock` under Prisma/PgBouncer.
 */

export const CRON_LEASE_TICK = "growth-tick";
export const CRON_LEASE_ENRICHMENT = "growth-enrichment";
export const CRON_LEASE_OUTREACH = "growth-outreach";

/** Tick often runs 90–150s; TTL must exceed that but stay under 15m cadence. */
export const CRON_LEASE_TICK_TTL_MS = 12 * 60_000;
/** Enrichment is lighter; keep short so staggered runs are not blocked long. */
export const CRON_LEASE_ENRICHMENT_TTL_MS = 8 * 60_000;
export const CRON_LEASE_OUTREACH_TTL_MS = 10 * 60_000;

export type CronLeaseAcquireResult =
  | {
      status: "acquired";
      release: () => Promise<void>;
    }
  | {
      status: "already_running";
      lockedByRequestId: string | null;
      expiresAt: string | null;
    };

export async function acquireCronJobLease(
  prisma: PrismaClient,
  opts: {
    leaseId: string;
    requestId: string;
    ttlMs: number;
  },
): Promise<CronLeaseAcquireResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(30_000, opts.ttlMs));
  const id = opts.leaseId.replace(/'/g, "");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "DiscoveryExecutionGuard" ("id", "updatedAt")
       VALUES ('${id}', CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING`,
    );

    const rows = await tx.$queryRawUnsafe<
      Array<{
        lockedAt: Date | null;
        expiresAt: Date | null;
        lockedByRequestId: string | null;
      }>
    >(
      `SELECT "lockedAt", "expiresAt", "lockedByRequestId"
       FROM "DiscoveryExecutionGuard"
       WHERE "id" = '${id}'
       FOR UPDATE`,
    );

    const row = rows[0];
    if (!row) {
      throw new Error(`Cron lease row missing after upsert: ${id}`);
    }

    const lockActive =
      row.expiresAt != null && row.expiresAt.getTime() > now.getTime() && row.lockedAt != null;
    if (lockActive) {
      return {
        status: "already_running",
        lockedByRequestId: row.lockedByRequestId,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };
    }

    await tx.discoveryExecutionGuard.update({
      where: { id },
      data: {
        lockedAt: now,
        expiresAt,
        lockedByRequestId: opts.requestId.slice(0, 120),
      },
    });

    const release = async () => {
      await prisma.discoveryExecutionGuard.update({
        where: { id },
        data: {
          lockedAt: null,
          expiresAt: null,
          lockedByRequestId: null,
        },
      });
    };

    return { status: "acquired", release };
  });
}
