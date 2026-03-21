import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  LAUNCH_METRICS_COOKIE_NAME,
  LAUNCH_METRICS_PATH_PREFIX,
  launchMetricsCookieToken,
} from "@/lib/launchMetricsEdge";

/** Forward pathname + search for safe post-login `next` URLs in authz. */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith(LAUNCH_METRICS_PATH_PREFIX)) {
    const secret = process.env.MICSTAGE_LAUNCH_METRICS_SECRET?.trim();
    if (!secret) {
      return new NextResponse(null, { status: 404 });
    }
    const expectedToken = await launchMetricsCookieToken(secret);
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
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
