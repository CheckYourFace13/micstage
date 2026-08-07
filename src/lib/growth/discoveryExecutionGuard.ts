import type { PrismaClient } from "@/generated/prisma/client";
import type { DiscoveryRequestSourceSnapshot } from "@/lib/growth/discoveryRequestSourceLog";

export const DISCOVERY_GUARD_ID = "growth-discovery";

/** Lease TTL — longer than Hostinger curl --max-time 300 plus auto-publish headroom. */
export const DISCOVERY_LOCK_TTL_MS = 15 * 60_000;

/**
 * UTC half-hour bucket for discovery idempotency.
 * Examples: `2026-08-07T15:00` (minutes 0–29) or `2026-08-07T15:30` (minutes 30–59).
 */
export type DiscoveryScheduleBucket = string;

export function utcDiscoveryScheduleBucket(at: Date = new Date()): DiscoveryScheduleBucket {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  const h = String(at.getUTCHours()).padStart(2, "0");
  const half = at.getUTCMinutes() < 30 ? "00" : "30";
  return `${y}-${m}-${d}T${h}:${half}`;
}

/** @deprecated Use utcDiscoveryScheduleBucket — kept as alias for call sites. */
export function utcDiscoveryHourBucket(at: Date = new Date()): DiscoveryScheduleBucket {
  return utcDiscoveryScheduleBucket(at);
}

export function discoveryScheduleBucketWindow(at: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
      at.getUTCHours(),
      at.getUTCMinutes() < 30 ? 0 : 30,
      0,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + 30 * 60 * 1000) };
}

export function discoveryHourBypassRequested(request: Request): boolean {
  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm")?.trim();
  return confirm === "FORCE_DISCOVERY_HOUR_BYPASS" || confirm === "FORCE_DISCOVERY_BUCKET_BYPASS";
}

export type DiscoveryGuardAcquireResult =
  | {
      status: "acquired";
      hourBucket: DiscoveryScheduleBucket;
      release: (opts: {
        completedRunId: string | null;
        failed: boolean;
      }) => Promise<void>;
    }
  | {
      status: "already_running";
      hourBucket: DiscoveryScheduleBucket;
      lockedByRequestId: string | null;
      expiresAt: string | null;
    }
  | {
      status: "already_completed";
      hourBucket: DiscoveryScheduleBucket;
      existingRunId: string | null;
      completedAt: string | null;
    };

/**
 * Postgres row-lease single-flight + half-hour completion idempotency.
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
  const hourBucket = utcDiscoveryScheduleBucket();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DISCOVERY_LOCK_TTL_MS);
  const window = discoveryScheduleBucketWindow(now);

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

    // Belt-and-suspenders: any GrowthDiscoveryRun already in this half-hour window.
    if (!opts.bypassHourlyGuard) {
      const existing = await tx.growthDiscoveryRun.findFirst({
        where: { createdAt: { gte: window.start, lt: window.end } },
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
