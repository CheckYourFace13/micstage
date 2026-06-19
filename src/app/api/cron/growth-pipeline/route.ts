import { NextResponse } from "next/server";
import {
  growthAutoDraftCronEnabled,
  growthLeadDiscoveryCronEnabled,
} from "@/lib/growth/expansionConfig";
import { runAutoGrowthOutreachDrafts } from "@/lib/growth/growthDraftAutomation";
import { runGrowthLeadDiscovery } from "@/lib/growth/growthDiscoveryRun";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaOrNull } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";

/** Session-scoped Postgres advisory lock (outreach only — do not hold during web discovery). */
const GROWTH_OUTREACH_LOCK_K1 = 54_788_913;
const GROWTH_OUTREACH_LOCK_K2 = 20_993_312;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GrowthPipelinePhase = "all" | "discovery" | "outreach";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

function parsePhase(request: Request): GrowthPipelinePhase {
  const p = new URL(request.url).searchParams.get("phase")?.trim().toLowerCase();
  if (p === "discovery" || p === "outreach") return p;
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
  const discoveryEnabled = growthLeadDiscoveryCronEnabled() && phase !== "outreach";
  const draftEnabled = growthAutoDraftCronEnabled() && phase !== "discovery";

  try {
    let discovery: Awaited<ReturnType<typeof runGrowthLeadDiscovery>> | null = null;
    let discoveryError: string | null = null;
    let drafts: Awaited<ReturnType<typeof runAutoGrowthOutreachDrafts>> | null = null;
    let outreachSkippedReason: string | null = null;

    // Outreach first on combined runs so invites still send if discovery is slow (Hostinger 504).
    if (draftEnabled) {
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

    if (discoveryEnabled) {
      try {
        discovery = await runGrowthLeadDiscovery(prisma);
      } catch (e) {
        discoveryError = e instanceof Error ? e.message : String(e);
        console.error("[growth pipeline] discovery failed", { error: discoveryError, phase });
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
        autoDrafts: drafts,
        growthLeadsCreatedUtcTodayBySourceKind: growthLeadsCreatedUtcToday,
        hint:
          phase === "all"
            ? "On Hostinger, prefer ?phase=outreach and ?phase=discovery as separate cron calls to avoid 504 gateway timeouts."
            : undefined,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message, phase }, { status: 500 });
  }
}
