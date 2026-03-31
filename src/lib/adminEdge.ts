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

/**
 * Root path so the session cookie is sent on every request to this origin (fixes nested /internal/admin/*).
 * Scoped paths like /internal/admin can fail with some proxies, cached responses, or duplicate cookie pairs.
 */
export const ADMIN_SESSION_COOKIE_PATH = "/";

/** Names/paths to expire on admin logout (current + legacy); keep in sync with session clearing on venue/artist login. */
export const ADMIN_LOGOUT_COOKIE_TARGETS: readonly { name: string; path: string }[] = [
  { name: ADMIN_COOKIE_NAME, path: ADMIN_SESSION_COOKIE_PATH },
  { name: ADMIN_EMAIL_COOKIE_NAME, path: ADMIN_SESSION_COOKIE_PATH },
  { name: "micstage_admin", path: "/" },
  { name: "micstage_admin", path: ADMIN_PATH_PREFIX },
  { name: "micstage_admin_sess", path: ADMIN_PATH_PREFIX },
  { name: "micstage_admin_email", path: ADMIN_PATH_PREFIX },
] as const;
