import { NextResponse } from "next/server";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";

/** Clears venue/artist session and redirects home (avoids RSC + server action + redirect edge cases). */
export async function GET(request: Request) {
  const home = new URL("/", request.url);
  const res = NextResponse.redirect(home);
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
