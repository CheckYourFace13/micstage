import { NextResponse } from "next/server";
import { recordMarketingOutreachClick, verifyMarketingClickToken } from "@/lib/marketing/clickTracking";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const decoded = verifyMarketingClickToken(decodeURIComponent(token));
  if (!decoded) {
    return NextResponse.redirect(new URL("/", process.env.APP_URL || "https://micstage.com"), 302);
  }

  const prisma = getPrismaOrNull();
  if (prisma) {
    await recordMarketingOutreachClick(prisma, {
      sendId: decoded.sendId,
      destinationUrl: decoded.destinationUrl,
    });
  }

  return NextResponse.redirect(decoded.destinationUrl, 302);
}
