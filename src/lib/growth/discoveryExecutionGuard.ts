import type { PrismaClient } from "@/generated/prisma/client";
import type { DiscoveryRequestSourceSnapshot } from "@/lib/growth/discoveryRequestSourceLog";

export const DISCOVERY_GUARD_ID = "growth-discovery";

/** Lease TTL — longer than Hostinger curl --max-time 300 plus auto-publish headroom. */
export const DISCOVERY_LOCK_TTL_MS = 15 * 60_000;

export type DiscoveryHourBucket = string; // "YYYY-MM-DDTHH" UTC

export function utcDiscoveryHourBucket(at: Date = new Date()): DiscoveryHourBucket {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  const h = String(at.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

export function discoveryHourBypassRequested(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("confirm") === "FORCE_DISCOVERY_HOUR_BYPASS";
}

export type DiscoveryGuardAcquireResult =
  | {
      status: "acquired";
      hourBucket: DiscoveryHourBucket;
      release: (opts: {
        completedRunId: string | null;
        failed: boolean;
      }) => Promise<void>;
    }
  | {
      status: "already_running";
      hourBucket: DiscoveryHourBucket;
      lockedByRequestId: string | null;
      expiresAt: string | null;
    }
  | {
      status: "already_completed";
      hourBucket: DiscoveryHourBucket;
      existingRunId: string | null;
      completedAt: string | null;
    };

/**
 * Postgres row-lease single-flight + hourly completion idempotency.
 * Uses SELECT … FOR UPDATE so it works across Node processes and pooled connections
 * (session `pg_try_advisory_lock` does not, under Prisma/PgBouncer).
 */
export async function acquireDiscoveryExecution(
  prisma: PrismaClient,
  opts: {
    requestId: string;
    bypassHourlyGuard: boolean;
  },
): Promise<DiscoveryGuardAcquireResult> {
  const hourBucket = utcDiscoveryHourBucket();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DISCOVERY_LOCK_TTL_MS);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "DiscoveryExecutionGuard" ("id", "updatedAt")
       VALUES ('${DISCOVERY_GUARD_ID}', CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING`,
    );

    const rows = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        lockedAt: Date | null;
        expiresAt: Date | null;
        lockedByRequestId: string | null;
        lastCompletedAt: Date | null;
        lastCompletedRunId: string | null;
        lastCompletedHourBucket: string | null;
      }>
    >(
      `SELECT "id", "lockedAt", "expiresAt", "lockedByRequestId",
              "lastCompletedAt", "lastCompletedRunId", "lastCompletedHourBucket"
       FROM "DiscoveryExecutionGuard"
       WHERE "id" = '${DISCOVERY_GUARD_ID}'
       FOR UPDATE`,
    );

    const row = rows[0];
    if (!row) {
      throw new Error("DiscoveryExecutionGuard row missing after upsert");
    }

    const lockActive =
      row.expiresAt != null && row.expiresAt.getTime() > now.getTime() && row.lockedAt != null;

    if (lockActive) {
      return {
        status: "already_running",
        hourBucket,
        lockedByRequestId: row.lockedByRequestId,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };
    }

    if (
      !opts.bypassHourlyGuard &&
      row.lastCompletedHourBucket === hourBucket &&
      row.lastCompletedRunId
    ) {
      return {
        status: "already_completed",
        hourBucket,
        existingRunId: row.lastCompletedRunId,
        completedAt: row.lastCompletedAt?.toISOString() ?? null,
      };
    }

    // Also treat a GrowthDiscoveryRun created in this UTC hour as completed (belt-and-suspenders).
    if (!opts.bypassHourlyGuard) {
      const hourStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0),
      );
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      const existing = await tx.growthDiscoveryRun.findFirst({
        where: { createdAt: { gte: hourStart, lt: hourEnd } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        await tx.discoveryExecutionGuard.update({
          where: { id: DISCOVERY_GUARD_ID },
          data: {
            lastCompletedAt: existing.createdAt,
            lastCompletedRunId: existing.id,
            lastCompletedHourBucket: hourBucket,
            lockedAt: null,
            expiresAt: null,
            lockedByRequestId: null,
          },
        });
        return {
          status: "already_completed",
          hourBucket,
          existingRunId: existing.id,
          completedAt: existing.createdAt.toISOString(),
        };
      }
    }

    await tx.discoveryExecutionGuard.update({
      where: { id: DISCOVERY_GUARD_ID },
      data: {
        lockedAt: now,
        expiresAt,
        lockedByRequestId: opts.requestId,
      },
    });

    const release = async (releaseOpts: { completedRunId: string | null; failed: boolean }) => {
      const clear = {
        lockedAt: null,
        expiresAt: null,
        lockedByRequestId: null,
      };
      if (!releaseOpts.failed && releaseOpts.completedRunId) {
        await prisma.discoveryExecutionGuard.update({
          where: { id: DISCOVERY_GUARD_ID },
          data: {
            ...clear,
            lastCompletedAt: new Date(),
            lastCompletedRunId: releaseOpts.completedRunId,
            lastCompletedHourBucket: hourBucket,
          },
        });
      } else {
        await prisma.discoveryExecutionGuard.update({
          where: { id: DISCOVERY_GUARD_ID },
          data: clear,
        });
      }
    };

    return { status: "acquired", hourBucket, release };
  });
}

export async function persistDiscoveryInvocationLog(
  prisma: PrismaClient,
  opts: {
    snapshot: DiscoveryRequestSourceSnapshot;
    outcome: string;
    hourBucket: string;
    growthDiscoveryRunId?: string | null;
    durationMs?: number | null;
  },
): Promise<void> {
  try {
    await prisma.discoveryInvocationLog.create({
      data: {
        requestId: opts.snapshot.requestId,
        phase: opts.snapshot.phase,
        method: opts.snapshot.method,
        host: opts.snapshot.host,
        userAgent: opts.snapshot.userAgent,
        sourceIpRedacted: opts.snapshot.sourceIpRedacted,
        xffPresent: opts.snapshot.xForwardedFor.present,
        xffHopCount: opts.snapshot.xForwardedFor.hopCount,
        authorizationPassed: opts.snapshot.authorizationPassed,
        possibleRetryOfRequestId: opts.snapshot.possibleRetryOfRequestId,
        outcome: opts.outcome,
        growthDiscoveryRunId: opts.growthDiscoveryRunId ?? null,
        hourBucket: opts.hourBucket,
        durationMs: opts.durationMs ?? null,
      },
    });
  } catch (e) {
    console.error("[discovery-guard] DiscoveryInvocationLog persist failed", e);
  }
}
