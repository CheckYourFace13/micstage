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
 * Weekly owner summary email (Friday 6:05 PM America/Chicago).
 *
 * POST or GET /api/cron/daily-owner-summary
 * Query: ?force=1 — send now (ignore Friday window + week idempotency). Auth required.
 *
 * Env: MICSTAGE_DISABLE_OWNER_SUMMARY=1 — no-op.
 *      MICSTAGE_OWNER_SUMMARY_EMAIL — override recipient.
 *
 * MICSTAGE_OWNER_SUMMARY_SKIP_TIME_GUARD is intentionally IGNORED for auto-sends.
 * Only ?force=1 bypasses the Friday window (so accidental cron/route calls cannot
 * email Mon–Thu/Sat/Sun).
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

  // Hard Friday gate for every non-force call — never honor SKIP_TIME_GUARD.
  if (!force && !slot.shouldSend) {
    console.info("[owner summary cron] skip: outside Friday 6:05 PM Chicago window", {
      chicagoDate: slot.chicagoDate,
      chicagoWeek: slot.chicagoWeek,
      chicagoWeekday: slot.chicagoWeekday,
      chicagoHour: slot.chicagoHour,
      chicagoMinute: slot.chicagoMinute,
    });
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "outside_friday_chicago_1805_window",
        chicago: slot,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
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
