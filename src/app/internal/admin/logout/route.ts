import { NextResponse } from "next/server";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_PATH,
} from "@/lib/adminEdge";
import { absoluteUrl } from "@/lib/publicSeo";

function hostFromUrlMaybe(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.startsWith("127.") ||
    host === "[::1]" ||
    host.endsWith(".local")
  );
}

function candidateCookieDomains(request: Request): string[] {
  const out = new Set<string>();
  const addHost = (host: string | null) => {
    if (!host) return;
    const normalized = host.toLowerCase();
    if (isLocalHost(normalized)) return;
    out.add(normalized);
    if (normalized.startsWith("www.")) {
      out.add(normalized.slice(4));
    } else {
      out.add(`www.${normalized}`);
    }
  };

  addHost(hostFromUrlMaybe(process.env.NEXT_PUBLIC_APP_URL));
  addHost(hostFromUrlMaybe(process.env.APP_URL));

  const hostHeader = request.headers.get("host")?.split(":")[0]?.trim().toLowerCase() ?? null;
  addHost(hostHeader || null);

  return Array.from(out);
}

export async function GET(request: Request) {
  const res = NextResponse.redirect(absoluteUrl("/"));
  const secure = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure, sameSite: "lax" as const, maxAge: 0 };
  const paths = ["/", ADMIN_PATH_PREFIX, ADMIN_SESSION_COOKIE_PATH];
  const domains = candidateCookieDomains(request);
  const cookieNames = [
    ADMIN_COOKIE_NAME,
    ADMIN_EMAIL_COOKIE_NAME,
    "micstage_admin",
    "micstage_admin_sess",
    "micstage_admin_email",
  ];

  const clearCookie = (name: string, path: string, domain?: string) => {
    res.cookies.set(name, "", domain ? { ...base, path, domain } : { ...base, path });
  };

  for (const name of cookieNames) {
    for (const path of paths) {
      clearCookie(name, path);
      for (const domain of domains) {
        clearCookie(name, path, domain);
      }
    }
  }

  res.cookies.set(OM_SESSION_COOKIE_NAME, "", { ...base, path: "/" });

  return res;
}
