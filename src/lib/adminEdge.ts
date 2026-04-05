/**
 * Edge-safe HMAC session token for internal admin cookie (must match Node in adminAuth.ts).
 * Uses SHA-256(secret) as the HMAC key so long secrets match Node's createHmac behavior.
 */
const MESSAGE = "micstage:admin-session:v2";

export async function adminSessionToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(MESSAGE));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** New name + root path avoids duplicate legacy cookies (same name, different paths) confusing parsers. */
export const ADMIN_COOKIE_NAME = "micstage_admin_sess";

export const ADMIN_EMAIL_COOKIE_NAME = "micstage_admin_email";

export const ADMIN_PATH_PREFIX = "/internal/admin";

/** Canonical admin logout URL (GET clears cookies and redirects home). */
export const ADMIN_LOGOUT_PATH = `${ADMIN_PATH_PREFIX}/logout` as const;

/** POST target for sign-in form (Route Handler + redirect; avoids Server Action redirect internal fetch noise). */
export const ADMIN_LOGIN_SUBMIT_PATH = `${ADMIN_PATH_PREFIX}/login-submit` as const;

/** Opt-in: `MICSTAGE_ADMIN_LOGOUT_DEBUG=1` logs logout + middleware cookie visibility (no secrets). */
export function logAdminLogoutDebug(phase: string, detail?: Record<string, unknown>): void {
  if (process.env.MICSTAGE_ADMIN_LOGOUT_DEBUG !== "1") return;
  console.info(`[micstage:admin-logout] ${phase}`, detail ?? {});
}

/**
 * Root path so the session cookie is sent on every request to this origin (fixes nested /internal/admin/*).
 * Scoped paths like /internal/admin can fail with some proxies, cached responses, or duplicate cookie pairs.
 */
export const ADMIN_SESSION_COOKIE_PATH = "/";

/**
 * Each (name, path) must become its own `Set-Cookie` line. `NextResponse.cookies.set()` uses a Map keyed by **name only**,
 * so looping `.set()` drops earlier paths — always expire both `/` and `/internal/admin` for every admin cookie name.
 * Keep in sync with `clearAdminSessionCookiesInJar` in session.ts.
 */
export const ADMIN_LOGOUT_COOKIE_TARGETS: readonly { name: string; path: string }[] = [
  // Order: longer path before `/` so `cookies().set()` (Map keyed by name) leaves a `Path=/` expire as the final op per name.
  { name: ADMIN_COOKIE_NAME, path: ADMIN_PATH_PREFIX },
  { name: ADMIN_COOKIE_NAME, path: ADMIN_SESSION_COOKIE_PATH },
  { name: ADMIN_EMAIL_COOKIE_NAME, path: ADMIN_PATH_PREFIX },
  { name: ADMIN_EMAIL_COOKIE_NAME, path: ADMIN_SESSION_COOKIE_PATH },
  { name: "micstage_admin", path: ADMIN_PATH_PREFIX },
  { name: "micstage_admin", path: ADMIN_SESSION_COOKIE_PATH },
] as const;
