import { NextResponse } from "next/server";
import { applyAdminLogoutCookiesToResponse } from "@/lib/adminAuth";
import { logAdminLogoutDebug } from "@/lib/adminEdge";

/**
 * Admin logout: single supported path. Sets `Set-Cookie` expire headers on the same response as the redirect
 * (reliable in production). Prefer this over server actions that call `redirect()` after `cookies().set`.
 */
export async function GET(request: Request) {
  logAdminLogoutDebug("route:enter", { url: request.url });

  const home = new URL("/", request.url);
  const res = NextResponse.redirect(home);
  applyAdminLogoutCookiesToResponse(res);

  logAdminLogoutDebug("route:redirect", {
    location: home.pathname,
    setCookieNames: res.cookies.getAll().map((c) => c.name),
  });

  return res;
}
