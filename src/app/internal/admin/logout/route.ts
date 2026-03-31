import { NextResponse } from "next/server";
import { applyAdminLogoutCookiesToResponse } from "@/lib/adminAuth";

/** Fallback for bookmarks; primary logout is `adminLogoutAction` from the site header. */
export async function GET(request: Request) {
  const home = new URL("/", request.url);
  const res = NextResponse.redirect(home);
  applyAdminLogoutCookiesToResponse(res);
  return res;
}
