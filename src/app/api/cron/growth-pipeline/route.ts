import { NextResponse } from "next/server";
import {
  growthAutoDraftCronEnabled,
  growthLeadDiscoveryCronEnabled,
} from "@/lib/growth/expansionConfig";
import { runAutoGrowthOutreachDrafts } from "@/lib/growth/growthDraftAutomation";
import { runGrowthLeadDiscovery } from "@/lib/growth/growthDiscoveryRun";
import { autoPublishGrowthLeadsAsListings } from "@/lib/publicListings/autoPublishGrowthLeadsAsListings";
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
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const phase = parsePhase(request);
  const discoveryEnabled = growthLeadDiscoveryCronEnabled() && phase !== "outreach" && phase !== "tick";
  const draftEnabled = growthAutoDraftCronEnabled() && phase !== "discovery";
  const emailMiningEnabled = phase === "tick";

  try {
    let discovery: Awaited<ReturnType<typeof runGrowthLeadDiscovery>> | null = null;
    let discoveryError: string | null = null;
    let listingAutoPublish: Awaited<ReturnType<typeof autoPublishGrowthLeadsAsListings>> | null = null;
    let drafts: Awaited<ReturnType<typeof runAutoGrowthOutreachDrafts>> | null = null;
    let emailMining: Awaited<ReturnType<typeof runMarketingSocialPayloadBatch>> | null = null;
    let listingClaimInvites: Awaited<ReturnType<typeof runPendingListingClaimInvites>> | null = null;
    let resendBudget: Awaited<ReturnType<typeof resendDailyBudgetSnapshot>> | null = null;
    let pendingClaimInvites: number | null = null;
    let outreachSkippedReason: string | null = null;

    if (emailMiningEnabled) {
      const batchSize = resolveMarketingSocialPayloadBatchSize(request);
      emailMining = await runMarketingSocialPayloadBatch(prisma, batchSize);
    }

    if (draftEnabled) {
      resendBudget = await resendDailyBudgetSnapshot(prisma);
      pendingClaimInvites = await countPendingListingClaimInvitesWithEmail(prisma);
      const inviteBatch = Math.min(listingClaimInvitesPerCron(), resendBudget.remaining);
      if (inviteBatch > 0) {
        listingClaimInvites = await runPendingListingClaimInvites(prisma, inviteBatch);
        resendBudget = await resendDailyBudgetSnapshot(prisma);
        pendingClaimInvites = await countPendingListingClaimInvitesWithEmail(prisma);
      } else {
        listingClaimInvites = { sent: 0, skipped: 0, candidates: 0 };
      }
    }

    if (draftEnabled) {
      if (resendBudget && resendBudget.remaining <= 0) {
        outreachSkippedReason = "resend daily budget exhausted";
      } else if (
        pendingClaimInvites != null &&
        pendingClaimInvites > 0 &&
        growthOutreachPausedWhileClaimInvitesPending()
      ) {
        outreachSkippedReason = "outreach paused while claim invites pending";
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
    return NextResponse.json({ ok: false, error: message, phase }, { status: 500 });
  }
}
