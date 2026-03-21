/**
 * One-shot query flags for Vercel Web Analytics custom events (see MicStageProductAnalytics).
 * Stripped from the URL after send. No PII.
 */
export const PRODUCT_ANALYTICS_QS = {
  booked: "booked",
  cancelled: "cancelled",
  joined: "joined",
} as const;

export const JOINED_MUSICIAN = "musician";
export const JOINED_VENUE = "venue";

export function isAnalyticsDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "1";
}
