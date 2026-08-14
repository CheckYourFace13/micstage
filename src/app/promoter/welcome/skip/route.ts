import { NextResponse } from "next/server";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

export const runtime = "nodejs";

/** Mark welcome as seen and land on the friendly dashboard. */
export async function GET() {
  const res = NextResponse.redirect(absoluteServerRedirectUrl("/promoter"));
  res.cookies.set("om_promoter_welcome_seen", "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
