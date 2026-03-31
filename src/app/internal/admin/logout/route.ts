import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_PATH,
} from "@/lib/adminEdge";
import { absoluteUrl, siteOrigin } from "@/lib/publicSeo";

function adminCookieDomains(): string[] {
  try {
    const host = new URL(siteOrigin()).hostname.toLowerCase();
    if (!host || host === "localhost" || host.startsWith("127.") || host.endsWith(".local")) return [];
    return host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
  } catch {
    return [];
  }
}

export async function GET() {
  const res = NextResponse.redirect(absoluteUrl("/"));
  const secure = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure, sameSite: "lax" as const, maxAge: 0 };
  const domains = adminCookieDomains();
  const clearCookie = (name: string, path: string) => {
    res.cookies.set(name, "", { ...base, path });
    for (const domain of domains) {
      res.cookies.set(name, "", { ...base, path, domain });
    }
  };

  // Current cookies set by admin login/session flow.
  clearCookie(ADMIN_COOKIE_NAME, ADMIN_SESSION_COOKIE_PATH);
  clearCookie(ADMIN_EMAIL_COOKIE_NAME, ADMIN_SESSION_COOKIE_PATH);

  // Safe, narrow legacy cleanup (historical admin cookies scoped under /internal/admin).
  clearCookie("micstage_admin", "/");
  clearCookie("micstage_admin", ADMIN_PATH_PREFIX);
  clearCookie("micstage_admin_sess", ADMIN_PATH_PREFIX);
  clearCookie("micstage_admin_email", ADMIN_PATH_PREFIX);

  return res;
}
