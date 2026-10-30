import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { closeCustomerSupportLoops } from "@/lib/ops/closeCustomerSupportLoops";

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
 * One-shot, idempotent customer-support closeout (Ian reset + Unity acknowledgement).
 * Safe to call repeatedly. Auth matches other /api/cron routes.
 */
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

  try {
    const result = await closeCustomerSupportLoops(prisma);
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
