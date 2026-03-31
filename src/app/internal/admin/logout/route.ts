import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_PATH,
} from "@/lib/adminEdge";
import { absoluteUrl, siteOrigin } from "@/lib/publicSeo";

function adminCookieDomains(request: Request): string[] {
  const out = new Set<string>();
  const addHost = (host: string | null) => {
    if (!host) return;
    const normalized = host.toLowerCase();
    if (!normalized || normalized === "localhost" || normalized.startsWith("127.") || normalized.endsWith(".local")) {
      return;
    }
    out.add(normalized);
    if (normalized.startsWith("www.")) {
      out.add(normalized.slice(4));
    } else {
      out.add(`www.${normalized}`);
    }
  };

  try {
    addHost(new URL(siteOrigin()).hostname.toLowerCase());
  } catch {
    // ignore and still use request host fallback below
  }
  addHost(new URL(request.url).hostname.toLowerCase());
  return Array.from(out);
}

export async function GET(request: Request) {
  const res = NextResponse.redirect(absoluteUrl("/"));
  const secure = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure, sameSite: "lax" as const, maxAge: 0 };
  const domains = adminCookieDomains(request);
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
