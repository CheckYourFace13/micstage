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

/** Transaction-scoped Postgres advisory lock keys (serialize full growth pipeline cron run). */
const GROWTH_PIPELINE_LOCK_K1 = 54_788_913;
const GROWTH_PIPELINE_LOCK_K2 = 20_993_311;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
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

  const discoveryEnabled = growthLeadDiscoveryCronEnabled();
  const draftEnabled = growthAutoDraftCronEnabled();

  try {
    const run = await prisma.$transaction(
      async (tx) => {
        const lockRows = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
          `SELECT pg_try_advisory_xact_lock(${GROWTH_PIPELINE_LOCK_K1}, ${GROWTH_PIPELINE_LOCK_K2}) AS locked`,
        );
        const lockAcquired = lockRows[0]?.locked === true;
        if (!lockAcquired) {
          return { busy: true as const };
        }

        let discovery: Awaited<ReturnType<typeof runGrowthLeadDiscovery>> | null = null;
        let discoveryError: string | null = null;
        if (discoveryEnabled) {
          try {
            discovery = await runGrowthLeadDiscovery(tx as unknown as PrismaClient);
          } catch (e) {
            discoveryError = e instanceof Error ? e.message : String(e);
            console.error("[growth pipeline] discovery failed; continuing to draft/send phase", {
              error: discoveryError,
            });
          }
        }

        const sinceUtcDay = startOfUtcDay();
        const growthLeadsCreatedUtcTodayBySourceKind = await tx.growthLead.groupBy({
          by: ["sourceKind"],
          where: { createdAt: { gte: sinceUtcDay } },
          _count: { _all: true },
        });
        const growthLeadsCreatedUtcToday = Object.fromEntries(
          growthLeadsCreatedUtcTodayBySourceKind.map((r) => [r.sourceKind, r._count._all]),
        );
        const drafts = draftEnabled ? await runAutoGrowthOutreachDrafts(tx as unknown as PrismaClient) : null;

        return {
          busy: false as const,
          discovery,
          discoveryError,
          drafts,
          growthLeadsCreatedUtcToday,
        };
      },
      { maxWait: 45_000, timeout: 360_000 },
    );

    if (run.busy) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "growth-pipeline already running",
          discoveryEnabled,
          draftEnabled,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        discoveryEnabled,
        draftEnabled,
        discovery: run.discovery,
        discoveryError: run.discoveryError,
        autoDrafts: run.drafts,
        /** Uploads/imports use `sourceKind` (CSV_IMPORT, CLAUDE_CSV, …); discovery JSON `candidates_by_source` is adapter ids only. */
        growthLeadsCreatedUtcTodayBySourceKind: run.growthLeadsCreatedUtcToday,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
