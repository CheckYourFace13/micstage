import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { shouldAutoSendDailyOwnerSummary } from "@/lib/ownerSummary/chicagoWindow";
import { sendOwnerDailySummary } from "@/lib/ownerSummary/sendOwnerDailySummary";

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
 * Daily owner summary email (~8:00 AM America/Chicago). Schedule externally with TZ=America/Chicago,
 * or call hourly and rely on in-handler window guard.
 *
 * POST or GET /api/cron/daily-owner-summary
 * Query: ?force=1 — send now (ignore 8am window + idempotency). Auth required.
 *
 * Env: MICSTAGE_DISABLE_OWNER_SUMMARY=1 — no-op.
 *      MICSTAGE_OWNER_SUMMARY_EMAIL — override recipient (default chris@iscreamstudio.com).
 */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (process.env.MICSTAGE_DISABLE_OWNER_SUMMARY === "1") {
    return NextResponse.json(
      { ok: true, disabled: true, message: "MICSTAGE_DISABLE_OWNER_SUMMARY=1" },
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

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const now = new Date();
  const slot = shouldAutoSendDailyOwnerSummary(now);

  if (!force && process.env.MICSTAGE_OWNER_SUMMARY_SKIP_TIME_GUARD !== "1") {
    if (!slot.shouldSend) {
      console.info("[owner summary cron] skip: outside Chicago 8:00 window", {
        chicagoDate: slot.chicagoDate,
        chicagoHour: slot.chicagoHour,
        chicagoMinute: slot.chicagoMinute,
      });
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "outside_chicago_8am_window",
          chicago: slot,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  try {
    const result = await sendOwnerDailySummary(prisma, { now, force });
    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[owner summary cron] fatal", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
