import { NextResponse } from "next/server";
import {
  growthAutoDraftCronEnabled,
  growthLeadDiscoveryCronEnabled,
} from "@/lib/growth/expansionConfig";
import { runAutoGrowthOutreachDrafts } from "@/lib/growth/growthDraftAutomation";
import { runGrowthLeadDiscovery } from "@/lib/growth/growthDiscoveryRun";
import { getPrismaOrNull } from "@/lib/prisma";

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
    const drafts = draftEnabled ? await runAutoGrowthOutreachDrafts(prisma) : null;

    return NextResponse.json(
      {
        ok: true,
        discoveryEnabled,
        draftEnabled,
        discovery,
        autoDrafts: drafts,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
