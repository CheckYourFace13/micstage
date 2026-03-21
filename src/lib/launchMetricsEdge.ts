/**
 * Edge-safe token for launch-metrics cookie (must match middleware Web Crypto).
 * Message is versioned so rotating secret invalidates old cookies cleanly.
 */
const MESSAGE = "micstage:launch-metrics:v1";

export async function launchMetricsCookieToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(MESSAGE));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const LAUNCH_METRICS_COOKIE_NAME = "micstage_lm";
export const LAUNCH_METRICS_PATH_PREFIX = "/internal/launch-metrics";
