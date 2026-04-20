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

/** Transaction-scoped Postgres advisory lock keys (unique to growth draft/outreach automation). */
const GROWTH_DRAFT_PIPELINE_LOCK_K1 = 54_788_913;
const GROWTH_DRAFT_PIPELINE_LOCK_K2 = 20_993_311;

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
    const discovery = discoveryEnabled ? await runGrowthLeadDiscovery(prisma) : null;
    const sinceUtcDay = startOfUtcDay();
    const growthLeadsCreatedUtcTodayBySourceKind = await prisma.growthLead.groupBy({
      by: ["sourceKind"],
      where: { createdAt: { gte: sinceUtcDay } },
      _count: { _all: true },
    });
    const growthLeadsCreatedUtcToday = Object.fromEntries(
      growthLeadsCreatedUtcTodayBySourceKind.map((r) => [r.sourceKind, r._count._all]),
    );
    /**
     * Serialize draft creation + outreach sends so overlapping cron invocations do not interleave
     * (Postgres `pg_advisory_xact_lock` — held for the whole transaction on one pooled connection).
     * Discovery above is not under this lock and may still overlap across instances.
     */
    const drafts = draftEnabled
      ? await prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              `SELECT pg_advisory_xact_lock(${GROWTH_DRAFT_PIPELINE_LOCK_K1}, ${GROWTH_DRAFT_PIPELINE_LOCK_K2})`,
            );
            return runAutoGrowthOutreachDrafts(tx as unknown as PrismaClient);
          },
          { maxWait: 45_000, timeout: 240_000 },
        )
      : null;

    return NextResponse.json(
      {
        ok: true,
        discoveryEnabled,
        draftEnabled,
        discovery,
        autoDrafts: drafts,
        /** Uploads/imports use `sourceKind` (CSV_IMPORT, CLAUDE_CSV, …); discovery JSON `candidates_by_source` is adapter ids only. */
        growthLeadsCreatedUtcTodayBySourceKind: growthLeadsCreatedUtcToday,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
