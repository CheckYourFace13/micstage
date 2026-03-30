import { NextResponse } from "next/server";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_PATH,
} from "@/lib/adminEdge";
import { absoluteUrl } from "@/lib/publicSeo";

export async function GET() {
  const res = NextResponse.redirect(absoluteUrl("/"));
  const secure = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure, sameSite: "lax" as const, maxAge: 0 };

  res.cookies.set(ADMIN_COOKIE_NAME, "", { ...base, path: ADMIN_SESSION_COOKIE_PATH });
  res.cookies.set(ADMIN_EMAIL_COOKIE_NAME, "", { ...base, path: ADMIN_SESSION_COOKIE_PATH });
  res.cookies.set("micstage_admin", "", { ...base, path: "/" });
  res.cookies.set("micstage_admin", "", { ...base, path: ADMIN_PATH_PREFIX });
  res.cookies.set("micstage_admin_sess", "", { ...base, path: ADMIN_PATH_PREFIX });
  res.cookies.set("micstage_admin_email", "", { ...base, path: ADMIN_PATH_PREFIX });
  res.cookies.set(OM_SESSION_COOKIE_NAME, "", { ...base, path: "/" });

  return res;
}
