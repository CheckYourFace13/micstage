import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { runWeeklyOpenMicDigestJob } from "@/lib/weeklyOpenMicDigest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

/**
 * Weekly nearby open mic digest for artists who opted in (`weeklyNearbyOpenMicAlerts`).
 * Schedule externally (e.g. weekly) with the same auth as booking-reminders cron.
 */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (process.env.MICSTAGE_DISABLE_WEEKLY_DIGEST === "1") {
    return NextResponse.json(
      { ok: true, disabled: true, message: "MICSTAGE_DISABLE_WEEKLY_DIGEST=1" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    const stats = await runWeeklyOpenMicDigestJob(prisma, new Date());
    return NextResponse.json({ ok: true, stats }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
