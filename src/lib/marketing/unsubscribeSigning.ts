import { createHmac, timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

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
