import { NextResponse } from "next/server";
import { runBookingReminderJob } from "@/lib/bookingReminders";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST or GET /api/cron/booking-reminders
 *
 * Trigger from Vercel Cron, GitHub Actions, or any scheduler. Protect with a shared secret:
 *   Authorization: Bearer <CRON_SECRET>
 * or:
 *   x-micstage-cron-secret: <CRON_SECRET>
 *
 * Env: CRON_SECRET (or MICSTAGE_CRON_SECRET). Optional: MICSTAGE_DISABLE_BOOKING_REMINDERS=1 to no-op.
 *
 * Email: reuses RESEND_API_KEY + EMAIL_FROM + APP_URL (see src/lib/mailer.ts).
 */
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
  if (process.env.MICSTAGE_DISABLE_BOOKING_REMINDERS === "1") {
    return NextResponse.json(
      { ok: true, disabled: true, message: "MICSTAGE_DISABLE_BOOKING_REMINDERS=1" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  try {
    const stats = await runBookingReminderJob(new Date());
    return NextResponse.json({ ok: true, stats }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
