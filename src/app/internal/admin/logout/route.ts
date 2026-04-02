import { NextResponse } from "next/server";
import { applyAdminLogoutCookiesToResponse } from "@/lib/adminAuth";
import { logAdminLogoutDebug } from "@/lib/adminEdge";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

/**
 * Admin logout: single supported path. Sets `Set-Cookie` expire headers on the same response as the redirect
 * (reliable in production). Prefer this over server actions that call `redirect()` after `cookies().set`.
 *
 * Redirect `Location` must not use `request.url` origin (Docker/bind addresses like 0.0.0.0 leak into the browser).
 * Uses `absoluteServerRedirectUrl("/")` → `APP_URL` / `NEXT_PUBLIC_APP_URL` / `https://micstage.com`.
 */
export async function GET(request: Request) {
  let pathname = "/internal/admin/logout";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    /* ignore */
  }
  logAdminLogoutDebug("route:enter", { pathname });

  const redirectTarget = absoluteServerRedirectUrl("/");
  const res = NextResponse.redirect(redirectTarget);
  applyAdminLogoutCookiesToResponse(res);

  if (process.env.MICSTAGE_ADMIN_LOGOUT_DEBUG === "1") {
    console.info(`[micstage:admin-logout] redirectTarget=${redirectTarget}`);
  }

  logAdminLogoutDebug("route:redirect", {
    setCookieNames: res.cookies.getAll().map((c) => c.name),
  });

  return res;
}
