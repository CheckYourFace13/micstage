import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  LAUNCH_METRICS_COOKIE_NAME,
  LAUNCH_METRICS_PATH_PREFIX,
  launchMetricsCookieToken,
} from "@/lib/launchMetricsEdge";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_LOGIN_SUBMIT_PATH,
  ADMIN_LOGOUT_PATH,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_PATH,
  adminSessionToken,
  logAdminLogoutDebug,
} from "@/lib/adminEdge";
import { isAdminEmailAllowed } from "@/lib/adminAuthShared";
async function adminSessionTokenOrNull(secret: string): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      console.error("[micstage:middleware] Web Crypto API unavailable (crypto.subtle)");
      return null;
    }
    return await adminSessionToken(secret);
  } catch (e) {
    console.error("[micstage:middleware] adminSessionToken failed", e);
    return null;
  }
}

async function launchMetricsTokenOrNull(secret: string): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      console.error("[micstage:middleware] Web Crypto unavailable for launch metrics");
      return null;
    }
    return await launchMetricsCookieToken(secret);
  } catch (e) {
    console.error("[micstage:middleware] launchMetricsCookieToken failed", e);
    return null;
  }
}

/** Forward pathname + search for safe post-login `next` URLs in authz. */
export async function middleware(request: NextRequest) {
  try {
    return await runMiddleware(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[micstage:middleware] fatal", msg, e instanceof Error ? e.stack : "");
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "middleware_unhandled", hint: msg }, { status: 503 });
    }
    return new NextResponse(`MicStage: middleware error (${msg})`, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function runMiddleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    process.env.MICSTAGE_ADMIN_LOGOUT_DEBUG === "1" &&
    pathname === "/" &&
    request.method === "GET"
  ) {
    const ref = request.headers.get("referer") ?? "";
    if (ref.includes(ADMIN_LOGOUT_PATH)) {
      logAdminLogoutDebug("middleware:post-logout-home", {
        hadAdminCookie: Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value),
      });
    }
  }

  if (pathname.startsWith(ADMIN_PATH_PREFIX)) {
    const adminSecret = process.env.MICSTAGE_ADMIN_SECRET?.trim();
    if (!adminSecret) {
      return new NextResponse(null, { status: 404 });
    }

    const loginPath = `${ADMIN_PATH_PREFIX}/login`;
    const isLogin = pathname === loginPath || pathname.startsWith(`${loginPath}/`);
    const isLogoutRoute = pathname === ADMIN_LOGOUT_PATH || pathname.startsWith(`${ADMIN_LOGOUT_PATH}/`);
    const isLoginSubmit = pathname === ADMIN_LOGIN_SUBMIT_PATH;
    const skipAdminCookieCheck = isLogin || isLogoutRoute || isLoginSubmit;

    if (isLogoutRoute) {
      logAdminLogoutDebug("middleware", {
        pathname,
        hadAdminCookie: Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value),
        hadAdminEmailCookie: Boolean(request.cookies.get(ADMIN_EMAIL_COOKIE_NAME)?.value),
      });
    }

    if (!skipAdminCookieCheck) {
      const expectedToken = await adminSessionTokenOrNull(adminSecret);
      if (!expectedToken) {
        return new NextResponse("MicStage: admin session validation unavailable (crypto).", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const keyParam = request.nextUrl.searchParams.get("key");
      if (keyParam === adminSecret) {
        const emailParam = request.nextUrl.searchParams.get("email");
        if (!isAdminEmailAllowed(emailParam)) {
          return new NextResponse(null, { status: 404 });
        }
        const clean = request.nextUrl.clone();
        clean.searchParams.delete("key");
        clean.searchParams.delete("email");
        const res = NextResponse.redirect(clean);
        res.cookies.set(ADMIN_COOKIE_NAME, expectedToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: ADMIN_SESSION_COOKIE_PATH,
          maxAge: 60 * 60 * 24 * 7,
        });
        if (emailParam?.trim()) {
          res.cookies.set(ADMIN_EMAIL_COOKIE_NAME, emailParam.trim().toLowerCase(), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: ADMIN_SESSION_COOKIE_PATH,
            maxAge: 60 * 60 * 24 * 7,
          });
        }
        return res;
      }
      if (request.cookies.get(ADMIN_COOKIE_NAME)?.value !== expectedToken) {
        const u = request.nextUrl.clone();
        u.pathname = loginPath;
        u.search = "";
        const nextPath = `${pathname}${request.nextUrl.search}`;
        if (nextPath && nextPath !== loginPath) {
          u.searchParams.set("next", nextPath);
        }
        return NextResponse.redirect(u);
      }
    }
  }

  if (pathname.startsWith(LAUNCH_METRICS_PATH_PREFIX)) {
    const secret = process.env.MICSTAGE_LAUNCH_METRICS_SECRET?.trim();
    if (!secret) {
      return new NextResponse(null, { status: 404 });
    }
    const expectedToken = await launchMetricsTokenOrNull(secret);
    if (!expectedToken) {
      return new NextResponse(null, { status: 503 });
    }
    const keyParam = request.nextUrl.searchParams.get("key");
    if (keyParam === secret) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete("key");
      const res = NextResponse.redirect(clean);
      res.cookies.set(LAUNCH_METRICS_COOKIE_NAME, expectedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: LAUNCH_METRICS_PATH_PREFIX,
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }
    if (request.cookies.get(LAUNCH_METRICS_COOKIE_NAME)?.value !== expectedToken) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-micstage-pathname", `${pathname}${search}`);
  // Minimal chrome for iframe embeds (canonical lineup URL + ?embed=1).
  if (
    /^\/venues\/[^/]+\/lineup\/[^/]+$/.test(pathname) &&
    request.nextUrl.searchParams.get("embed") === "1"
  ) {
    requestHeaders.set("x-micstage-embed", "1");
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|robots\\.txt|sitemap\\.xml).*)"],
};
