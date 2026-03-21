import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Forward pathname + search for safe post-login `next` URLs in authz. */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-micstage-pathname", `${pathname}${search}`);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
