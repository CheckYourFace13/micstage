import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_LOGOUT_COOKIE_TARGETS,
  ADMIN_SESSION_COOKIE_PATH,
} from "@/lib/adminEdge";
import { OM_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";
import { isAdminEmailAllowed } from "@/lib/adminAuthShared";
import { clearSession } from "@/lib/session";

const MESSAGE = "micstage:admin-session:v2";

function adminCookieBase() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
  };
}

/** Drop stale cookies from older MicStage builds (different names/paths). */
function clearLegacyAdminCookies(jar: Awaited<ReturnType<typeof cookies>>) {
  const b = adminCookieBase();
  const expire = { ...b, maxAge: 0 };
  for (const t of ADMIN_LOGOUT_COOKIE_TARGETS) {
    if (t.name === ADMIN_COOKIE_NAME || t.name === ADMIN_EMAIL_COOKIE_NAME) continue;
    jar.set(t.name, "", { ...expire, path: t.path });
  }
}

/** Serialize one expired cookie; must not use `res.cookies.set` in a loop for same name + different paths (see adminEdge). */
function adminLogoutSetCookieHeader(name: string, path: string, secure: boolean): string {
  const parts = [`${name}=`, `Path=${path}`, "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function adminSetCookieHeader(name: string, value: string, path: string, maxAge: number, secure: boolean): string {
  const pair = value ? `${name}=${encodeURIComponent(value)}` : `${name}=`;
  const parts = [pair, `Path=${path}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Expire all admin session cookies on a `NextResponse` (use from Route Handlers only; see `ADMIN_LOGOUT_PATH`). */
export function applyAdminLogoutCookiesToResponse(res: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  for (const t of ADMIN_LOGOUT_COOKIE_TARGETS) {
    res.headers.append("Set-Cookie", adminLogoutSetCookieHeader(t.name, t.path, secure));
  }
}

/**
 * Route Handler sign-in: same cookie outcome as {@link setAdminSessionCookie}, with every `Set-Cookie` on the redirect
 * response (matches admin logout reliability; avoids Next Server Action redirect internal `fetch`, which can log
 * `failed to get redirect response` when that fetch fails in dev/Docker).
 */
export function applyAdminLoginSessionCookiesToResponse(
  res: NextResponse,
  secret: string,
  emailForAudit: string | null,
): void {
  const secure = process.env.NODE_ENV === "production";
  const token = adminSessionNodeToken(secret);
  const week = 60 * 60 * 24 * 7;

  res.headers.append(
    "Set-Cookie",
    adminSetCookieHeader(OM_SESSION_COOKIE_NAME, "", "/", 0, secure),
  );

  for (const t of ADMIN_LOGOUT_COOKIE_TARGETS) {
    if (t.name === ADMIN_COOKIE_NAME || t.name === ADMIN_EMAIL_COOKIE_NAME) continue;
    res.headers.append("Set-Cookie", adminSetCookieHeader(t.name, "", t.path, 0, secure));
  }

  res.headers.append(
    "Set-Cookie",
    adminSetCookieHeader(ADMIN_COOKIE_NAME, token, ADMIN_SESSION_COOKIE_PATH, week, secure),
  );

  const emailTrim = emailForAudit?.trim();
  if (emailTrim) {
    res.headers.append(
      "Set-Cookie",
      adminSetCookieHeader(ADMIN_EMAIL_COOKIE_NAME, emailTrim.toLowerCase(), ADMIN_SESSION_COOKIE_PATH, week, secure),
    );
  } else {
    res.headers.append(
      "Set-Cookie",
      adminSetCookieHeader(ADMIN_EMAIL_COOKIE_NAME, "", ADMIN_SESSION_COOKIE_PATH, 0, secure),
    );
  }
}

function derivedHmacKeyUtf8(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function adminSessionNodeToken(secret: string): string {
  return crypto.createHmac("sha256", derivedHmacKeyUtf8(secret)).update(MESSAGE, "utf8").digest("hex");
}

export function getAdminSecretOrNull(): string | null {
  const s = process.env.MICSTAGE_ADMIN_SECRET?.trim();
  return s || null;
}

/** Server Components / actions: require valid admin cookie or redirect to login. */
export async function assertAdminSession(): Promise<void> {
  const secret = getAdminSecretOrNull();
  if (!secret) {
    redirect("/internal/admin/login?error=config");
  }
  const jar = await cookies();
  const tok = jar.get(ADMIN_COOKIE_NAME)?.value;
  if (!tok || tok !== adminSessionNodeToken(secret)) {
    redirect("/internal/admin/login");
  }
}

/** True when admin cookie matches current env secret (footer link swap). */
export async function isAdminSessionCookieValid(): Promise<boolean> {
  const secret = getAdminSecretOrNull();
  if (!secret) return false;
  const jar = await cookies();
  const tok = jar.get(ADMIN_COOKIE_NAME)?.value;
  return Boolean(tok && tok === adminSessionNodeToken(secret));
}

export async function getOptionalAdminEmailFromLoginForm(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ADMIN_EMAIL_COOKIE_NAME)?.value || undefined;
}

/** Set alongside admin cookie when allowlist is used (read-only hint for UI). */
export async function setAdminSessionCookie(secret: string, emailForAudit?: string | null) {
  await clearSession();
  const token = adminSessionNodeToken(secret);
  const jar = await cookies();
  const b = adminCookieBase();
  clearLegacyAdminCookies(jar);

  jar.set(ADMIN_COOKIE_NAME, token, {
    ...b,
    path: ADMIN_SESSION_COOKIE_PATH,
    maxAge: 60 * 60 * 24 * 7,
  });
  if (emailForAudit?.trim()) {
    jar.set(ADMIN_EMAIL_COOKIE_NAME, emailForAudit.trim().toLowerCase(), {
      ...b,
      path: ADMIN_SESSION_COOKIE_PATH,
      maxAge: 60 * 60 * 24 * 7,
    });
  } else {
    jar.set(ADMIN_EMAIL_COOKIE_NAME, "", {
      ...b,
      path: ADMIN_SESSION_COOKIE_PATH,
      maxAge: 0,
    });
  }
}

export function validateAdminLogin(secretInput: string, emailInput: string | null): "ok" | "secret" | "email" {
  const secret = getAdminSecretOrNull();
  if (!secret || secretInput.trim() !== secret) return "secret";
  if (!isAdminEmailAllowed(emailInput)) return "email";
  return "ok";
}
