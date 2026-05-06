import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { reviewPromoterApplicationByToken } from "@/lib/promoterApplications";

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  if (!token) return redirectTo("/promoter/apply?error=review");

  const prisma = getPrismaOrNull();
  if (!prisma) return redirectTo("/promoter/apply?error=unavailable");

  try {
    const out = await reviewPromoterApplicationByToken(prisma, token);
    if (!out.ok) return redirectTo("/promoter/apply?error=review");
    const review = out.status === "APPROVED" ? "approved" : "rejected";
    return redirectTo(`/promoter/apply?review=${review}`);
  } catch (e) {
    console.error("[promoter apply] review failed", e);
    return redirectTo("/promoter/apply?error=review");
  }
}
