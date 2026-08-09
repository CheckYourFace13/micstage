import { NextResponse } from "next/server";
import {
  growthAutoDraftCronEnabled,
  growthLeadDiscoveryCronEnabled,
} from "@/lib/growth/expansionConfig";
import { runAutoGrowthOutreachDrafts } from "@/lib/growth/growthDraftAutomation";
import { runGrowthLeadDiscovery } from "@/lib/growth/growthDiscoveryRun";
import {
  beginDiscoveryRequestSourceLog,
  endDiscoveryRequestSourceLog,
} from "@/lib/growth/discoveryRequestSourceLog";
import {
  acquireDiscoveryExecution,
  discoveryHourBypassRequested,
  persistDiscoveryInvocationLog,
  utcDiscoveryHourBucket,
} from "@/lib/growth/discoveryExecutionGuard";
import { autoPublishGrowthLeadsAsListings } from "@/lib/publicListings/autoPublishGrowthLeadsAsListings";
import { runListingBacklogProcessor } from "@/lib/publicListings/listingBacklogProcessor";
import { runPendingListingClaimInvites } from "@/lib/publicListings/listingClaimInviteEmail";
import {
  countPendingListingClaimInvitesWithEmail,
  growthOutreachPausedWhileClaimInvitesPending,
  listingClaimInvitesPerCron,
  resendDailyBudgetSnapshot,
} from "@/lib/resendDailyBudget";
import {
  resolveMarketingSocialPayloadBatchSize,
  runMarketingSocialPayloadBatch,
} from "@/lib/growth/marketingSocialPayloadBatch";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaOrNull } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";
import { micstageDiscoveryKillSwitch } from "@/lib/publicListings/automationKillSwitches";
import { resolveClaimInviteRuntimeSnapshot } from "@/lib/publicListings/claimInviteRuntimeSettings";
import {
  growthRuntimeSnapshotForStatus,
  resolveGrowthPipelineRuntimeSnapshot,
} from "@/lib/growth/growthRuntimeSettings";

/** Session-scoped Postgres advisory lock (outreach only — do not hold during web discovery). */
const GROWTH_OUTREACH_LOCK_K1 = 54_788_913;
const GROWTH_OUTREACH_LOCK_K2 = 20_993_312;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GrowthPipelinePhase = "all" | "discovery" | "outreach" | "tick";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

function parsePhase(request: Request): GrowthPipelinePhase {
  const p = new URL(request.url).searchParams.get("phase")?.trim().toLowerCase();
  if (p === "discovery" || p === "outreach" || p === "tick") return p;
  return "all";
}

async function tryOutreachLock(prisma: PrismaClient): Promise<{ release: () => Promise<void> } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT pg_try_advisory_lock(${GROWTH_OUTREACH_LOCK_K1}, ${GROWTH_OUTREACH_LOCK_K2}) AS locked`,
  );
  if (!rows[0]?.locked) return null;
  return {
    release: async () => {
      await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${GROWTH_OUTREACH_LOCK_K1}, ${GROWTH_OUTREACH_LOCK_K2})`);
    },
  };
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const authOk = authorize(request);
  const phaseEarly = parsePhase(request);
  /** Log any request that would run discovery if authorized (not tick/outreach). */
  const isDiscoveryPhaseRequest = phaseEarly !== "outreach" && phaseEarly !== "tick";
  const discoverySourceLog = isDiscoveryPhaseRequest
    ? beginDiscoveryRequestSourceLog(request, {
        phase: phaseEarly,
        authorizationPassed: authOk,
      })
    : null;
  const discoveryStartedAtMs = discoverySourceLog ? Date.now() : 0;

  if (!authOk) {
    if (discoverySourceLog) {
      endDiscoveryRequestSourceLog(discoverySourceLog, {
        discoveryRunId: null,
        discoveryError: "Unauthorized",
        startedAtMs: discoveryStartedAtMs,
      });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    if (discoverySourceLog) {
      endDiscoveryRequestSourceLog(discoverySourceLog, {
        discoveryRunId: null,
        discoveryError: "DATABASE_URL not configured",
        startedAtMs: discoveryStartedAtMs,
      });
    }
    return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const phase = phaseEarly;
  const discoveryEnabled = growthLeadDiscoveryCronEnabled() && isDiscoveryPhaseRequest;
  const draftEnabled = growthAutoDraftCronEnabled() && phase !== "discovery";
  const emailMiningEnabled = phase === "tick";

  // Warm DB-backed growth knobs for Serp/backlog readers in this request.
  const growthRuntime = await resolveGrowthPipelineRuntimeSnapshot(prisma);

  try {
    let discovery: Awaited<ReturnType<typeof runGrowthLeadDiscovery>> | null = null;
    let discoveryError: string | null = null;
    let listingAutoPublish: Awaited<ReturnType<typeof autoPublishGrowthLeadsAsListings>> | null = null;
    let listingBacklog: Awaited<ReturnType<typeof runListingBacklogProcessor>> | null = null;
    let drafts: Awaited<ReturnType<typeof runAutoGrowthOutreachDrafts>> | null = null;
    let emailMining: Awaited<ReturnType<typeof runMarketingSocialPayloadBatch>> | null = null;
    let listingClaimInvites: Awaited<ReturnType<typeof runPendingListingClaimInvites>> | null = null;
    let resendBudget: Awaited<ReturnType<typeof resendDailyBudgetSnapshot>> | null = null;
    let pendingClaimInvites: number | null = null;
    let outreachSkippedReason: string | null = null;

    if (emailMiningEnabled) {
      const batchSize = resolveMarketingSocialPayloadBatchSize(request);
      emailMining = await runMarketingSocialPayloadBatch(prisma, batchSize);
      try {
        listingBacklog = await runListingBacklogProcessor(prisma);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[growth pipeline] listing backlog processor failed", { error: msg, phase });
      }
    }

    // Claim invites: independent of outreach drafts (canary can run while general outreach stays off).
    const claimInvitePhase = phase !== "discovery";
    if (claimInvitePhase) {
      resendBudget = await resendDailyBudgetSnapshot(prisma);
      pendingClaimInvites = await countPendingListingClaimInvitesWithEmail(prisma);
      const inviteBatch = Math.min(await listingClaimInvitesPerCron(prisma), resendBudget.remaining);
      if (inviteBatch > 0) {
        listingClaimInvites = await runPendingListingClaimInvites(prisma, inviteBatch);
        resendBudget = await resendDailyBudgetSnapshot(prisma);
        pendingClaimInvites = await countPendingListingClaimInvitesWithEmail(prisma);
      } else {
        listingClaimInvites = { sent: 0, skipped: 0, candidates: 0 };
      }
    }

    if (draftEnabled) {
      if (!resendBudget) {
        resendBudget = await resendDailyBudgetSnapshot(prisma);
      }
      if (pendingClaimInvites == null) {
        pendingClaimInvites = await countPendingListingClaimInvitesWithEmail(prisma);
      }
      const outreachRuntime = await resolveClaimInviteRuntimeSnapshot(prisma);
      if (resendBudget.remaining <= 0) {
        outreachSkippedReason = "resend daily budget exhausted";
      } else if (
        pendingClaimInvites > 0 &&
        growthOutreachPausedWhileClaimInvitesPending()
      ) {
        outreachSkippedReason = "outreach paused while claim invites pending";
      } else if (outreachRuntime.effectiveOutreachSendsPerCron <= 0) {
        outreachSkippedReason = "GROWTH_OUTREACH_SENDS_PER_CRON_RUN=0";
      } else {
        const lock = await tryOutreachLock(prisma);
        if (!lock) {
          outreachSkippedReason = "growth-outreach already running";
        } else {
          try {
            drafts = await runAutoGrowthOutreachDrafts(prisma);
          } finally {
            await lock.release();
          }
        }
      }
    }

    if (discoveryEnabled) {
      if (micstageDiscoveryKillSwitch()) {
        discoveryError = "MICSTAGE_KILL_DISCOVERY enabled";
        if (discoverySourceLog) {
          await persistDiscoveryInvocationLog(prisma, {
            snapshot: discoverySourceLog,
            outcome: "failed",
            hourBucket: utcDiscoveryHourBucket(),
            durationMs: Date.now() - discoveryStartedAtMs,
          });
          endDiscoveryRequestSourceLog(discoverySourceLog, {
            discoveryRunId: null,
            discoveryError,
            startedAtMs: discoveryStartedAtMs,
          });
        }
      } else {
        const bypassHourly = discoveryHourBypassRequested(request);
        const guard = await acquireDiscoveryExecution(prisma, {
          requestId: discoverySourceLog?.requestId ?? `ms-disc-${crypto.randomUUID()}`,
          bypassHourlyGuard: bypassHourly,
        });

        if (guard.status === "already_running") {
          if (discoverySourceLog) {
            await persistDiscoveryInvocationLog(prisma, {
              snapshot: discoverySourceLog,
              outcome: "already_running",
              hourBucket: guard.hourBucket,
              durationMs: Date.now() - discoveryStartedAtMs,
            });
            endDiscoveryRequestSourceLog(discoverySourceLog, {
              discoveryRunId: null,
              discoveryError: "already_running",
              startedAtMs: discoveryStartedAtMs,
            });
          }
          return NextResponse.json(
            {
              ok: true,
              status: "already_running",
              phase,
              hourBucket: guard.hourBucket,
              lockedByRequestId: guard.lockedByRequestId,
              expiresAt: guard.expiresAt,
            },
            { status: 202, headers: { "Cache-Control": "no-store" } },
          );
        }

        if (guard.status === "already_completed") {
          if (discoverySourceLog) {
            await persistDiscoveryInvocationLog(prisma, {
              snapshot: discoverySourceLog,
              outcome: "already_completed",
              hourBucket: guard.hourBucket,
              growthDiscoveryRunId: guard.existingRunId,
              durationMs: Date.now() - discoveryStartedAtMs,
            });
            endDiscoveryRequestSourceLog(discoverySourceLog, {
              discoveryRunId: guard.existingRunId,
              discoveryError: "already_completed",
              startedAtMs: discoveryStartedAtMs,
            });
          }
          return NextResponse.json(
            {
              ok: true,
              status: "already_completed",
              phase,
              hourBucket: guard.hourBucket,
              discoveryRunId: guard.existingRunId,
              completedAt: guard.completedAt,
            },
            { status: 202, headers: { "Cache-Control": "no-store" } },
          );
        }

        try {
          try {
            discovery = await runGrowthLeadDiscovery(prisma);
          } catch (e) {
            discoveryError = e instanceof Error ? e.message : String(e);
            console.error("[growth pipeline] discovery failed", { error: discoveryError, phase });
          }
          try {
            listingAutoPublish = await autoPublishGrowthLeadsAsListings(prisma);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[growth pipeline] listing auto-publish failed", { error: msg, phase });
            if (!discoveryError) discoveryError = `listing auto-publish: ${msg}`;
          }
        } finally {
          await guard.release({
            completedRunId: discovery?.discoveryRunId ?? null,
            failed: Boolean(discoveryError) && !discovery?.discoveryRunId,
          });
        }

        if (discoverySourceLog) {
          await persistDiscoveryInvocationLog(prisma, {
            snapshot: discoverySourceLog,
            outcome: discoveryError && !discovery?.discoveryRunId ? "failed" : "completed",
            hourBucket: guard.hourBucket,
            growthDiscoveryRunId: discovery?.discoveryRunId ?? null,
            durationMs: Date.now() - discoveryStartedAtMs,
          });
          endDiscoveryRequestSourceLog(discoverySourceLog, {
            discoveryRunId: discovery?.discoveryRunId ?? null,
            discoveryError,
            startedAtMs: discoveryStartedAtMs,
          });
        }
      }
    } else if (discoverySourceLog) {
      endDiscoveryRequestSourceLog(discoverySourceLog, {
        discoveryRunId: null,
        discoveryError: "discovery not enabled for this request",
        startedAtMs: discoveryStartedAtMs,
      });
    }

    const sinceUtcDay = startOfUtcDay();
    const growthLeadsCreatedUtcTodayBySourceKind = await prisma.growthLead.groupBy({
      by: ["sourceKind"],
      where: { createdAt: { gte: sinceUtcDay } },
      _count: { _all: true },
    });
    const growthLeadsCreatedUtcToday = Object.fromEntries(
      growthLeadsCreatedUtcTodayBySourceKind.map((r) => [r.sourceKind, r._count._all]),
    );

    if (outreachSkippedReason && !discovery && !drafts) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: outreachSkippedReason,
          phase,
          discoveryEnabled,
          draftEnabled,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        phase,
        discoveryEnabled,
        draftEnabled,
        outreachSkippedReason,
        discovery,
        discoveryError,
        listingAutoPublish,
        listingBacklog,
        growthRuntime: growthRuntimeSnapshotForStatus(growthRuntime),
        emailMining,
        resendBudget,
        pendingClaimInvites,
        listingClaimInvites,
        autoDrafts: drafts,
        growthLeadsCreatedUtcTodayBySourceKind: growthLeadsCreatedUtcToday,
        hint:
          phase === "tick"
            ? "One cron call: mine venue emails then draft/send outreach. Schedule every 15 min on Hostinger. Use ?phase=discovery hourly for nationwide venue discovery."
            : phase === "all"
              ? "On Hostinger, prefer ?phase=tick (every 15 min) and ?phase=discovery (hourly) as separate cron calls to avoid 504 gateway timeouts."
              : undefined,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (discoverySourceLog) {
      endDiscoveryRequestSourceLog(discoverySourceLog, {
        discoveryRunId: null,
        discoveryError: message,
        startedAtMs: discoveryStartedAtMs,
      });
    }
    return NextResponse.json({ ok: false, error: message, phase }, { status: 500 });
  }
}
