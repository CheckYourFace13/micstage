import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, ADMIN_EMAIL_COOKIE_NAME, ADMIN_PATH_PREFIX } from "@/lib/adminEdge";
import { isAdminEmailAllowed } from "@/lib/adminAuthShared";

const MESSAGE = "micstage:admin-session:v1";

export function adminSessionNodeToken(secret: string): string {
  return crypto.createHmac("sha256", secret).update(MESSAGE).digest("hex");
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

export async function getOptionalAdminEmailFromLoginForm(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get("micstage_admin_email")?.value || undefined;
}

/** Set alongside admin cookie when allowlist is used (read-only hint for UI). */
export async function setAdminSessionCookie(secret: string, emailForAudit?: string | null) {
  const token = adminSessionNodeToken(secret);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: ADMIN_PATH_PREFIX,
    maxAge: 60 * 60 * 24 * 7,
  });
  if (emailForAudit?.trim()) {
    jar.set(ADMIN_EMAIL_COOKIE_NAME, emailForAudit.trim().toLowerCase(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: ADMIN_PATH_PREFIX,
      maxAge: 60 * 60 * 24 * 7,
    });
  } else {
    jar.set(ADMIN_EMAIL_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: ADMIN_PATH_PREFIX,
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
