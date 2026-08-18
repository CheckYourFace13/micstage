import { createHmac, timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

function unsubscribeSecret(): string {
  return (
    process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "micstage-dev-unsubscribe-insecure"
  );
}

/** URL-safe signature for a contact (no per-contact secret storage). */
export function marketingUnsubscribeSignature(contactId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`unsub:v1:${contactId}`).digest("base64url");
}

export function verifyMarketingUnsubscribeSignature(contactId: string, sig: string): boolean {
  try {
    const expected = Buffer.from(marketingUnsubscribeSignature(contactId));
    const got = Buffer.from(sig, "utf8");
    if (got.length !== expected.length) return false;
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export function marketingUnsubscribeHttpsUrl(contactId: string): string {
  const base = appBaseUrl().replace(/\/$/, "");
  const sig = marketingUnsubscribeSignature(contactId);
  return `${base}/api/marketing/unsubscribe?contactId=${encodeURIComponent(contactId)}&sig=${encodeURIComponent(sig)}`;
}

export type MarketingUnsubscribeConfirmResult = "ok" | "invalid" | "failed";

/**
 * Public confirmation page after unsubscribe. Never uses `request.url` origin
 * (Hostinger listens on 0.0.0.0, which is not a user-facing host).
 * `requestUrl` is accepted only so callers/tests can prove it is ignored.
 */
export function marketingUnsubscribeConfirmUrl(
  result: MarketingUnsubscribeConfirmResult,
  requestUrl?: string,
): string {
  void requestUrl;
  const path =
    result === "ok" ? "/unsubscribe?ok=1" : result === "invalid" ? "/unsubscribe?err=invalid" : "/unsubscribe?err=failed";
  return absoluteServerRedirectUrl(path);
}
