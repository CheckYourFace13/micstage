import { NextResponse } from "next/server";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";
import { absoluteUrl } from "@/lib/publicSeo";

/** Clears venue/artist session and redirects home (avoids RSC + server action + redirect edge cases). */
export async function GET() {
  const res = NextResponse.redirect(absoluteUrl("/"));
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(OM_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
