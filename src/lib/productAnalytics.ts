/**
 * One-shot query flags for Vercel Web Analytics custom events (see MicStageProductAnalytics).
 * Stripped from the URL after send. No PII.
 */
export const PRODUCT_ANALYTICS_QS = {
  booked: "booked",
  cancelled: "cancelled",
  joined: "joined",
  /** Comma-separated host milestones: first_series | first_night | second_venue */
  hostMilestone: "hostMs",
} as const;

export const JOINED_MUSICIAN = "musician";
export const JOINED_VENUE = "venue";
export const JOINED_HOST = "host";

export const HOST_MILESTONE_FIRST_SERIES = "first_series";
export const HOST_MILESTONE_FIRST_NIGHT = "first_night";
export const HOST_MILESTONE_SECOND_VENUE = "second_venue";

export function isAnalyticsDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "1";
}
