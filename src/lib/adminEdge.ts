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

export const ADMIN_COOKIE_NAME = "micstage_admin";
export const ADMIN_EMAIL_COOKIE_NAME = "micstage_admin_email";
export const ADMIN_PATH_PREFIX = "/internal/admin";
