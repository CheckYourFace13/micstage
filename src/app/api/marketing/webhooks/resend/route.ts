import { NextResponse } from "next/server";
import { handleResendWebhookRequest } from "@/lib/marketing/resendWebhookHandler";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const result = await handleResendWebhookRequest(prisma, rawBody, {
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
  });

  return new NextResponse(result.body, { status: result.status });
}
