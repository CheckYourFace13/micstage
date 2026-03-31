import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";

/** Clears venue/artist session and redirects home (same origin as the request; bookmark-safe fallback). */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.url));
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
