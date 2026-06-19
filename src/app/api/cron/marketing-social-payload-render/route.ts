import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import {
  resolveMarketingSocialPayloadBatchSize,
  runMarketingSocialPayloadBatch,
} from "@/lib/growth/marketingSocialPayloadBatch";

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

  const batchSize = resolveMarketingSocialPayloadBatchSize(request);
  const result = await runMarketingSocialPayloadBatch(prisma, batchSize);

  if (result.processed === 0) {
    return NextResponse.json(
      { ok: true, claimed: false, batchSize, message: "No pending SOCIAL_PAYLOAD_RENDER jobs." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
