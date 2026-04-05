import { parseIntEnv } from "@/lib/marketing/emailConfig";

function parseFloatEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** When true, POST /api/cron/growth-expansion may auto-activate the next queued market. */
export function growthAutoExpansionCronEnabled(): boolean {
  return process.env.GROWTH_AUTO_EXPANSION_ENABLED === "true";
}

export type ExpansionThresholds = {
  minApprovedLeads: number;
  minSentEmails: number;
  minReplies: number;
  minJoinedConversions: number;
  maxBounceRate: number;
  maxUnsubscribeRate: number;
  maxComplaintSignalsGlobal: number;
};

/**
 * All thresholds are overridable via env. Defaults are conservative for early launch.
 */
export function loadExpansionThresholdsFromEnv(): ExpansionThresholds {
  return {
    minApprovedLeads: parseIntEnv("GROWTH_EXPANSION_MIN_APPROVED", 15),
    minSentEmails: parseIntEnv("GROWTH_EXPANSION_MIN_SENT", 8),
    minReplies: parseIntEnv("GROWTH_EXPANSION_MIN_REPLIES", 2),
    minJoinedConversions: parseIntEnv("GROWTH_EXPANSION_MIN_JOINED", 0),
    maxBounceRate: parseFloatEnv("GROWTH_EXPANSION_MAX_BOUNCE_RATE", 0.12),
    maxUnsubscribeRate: parseFloatEnv("GROWTH_EXPANSION_MAX_UNSUB_RATE", 0.05),
    maxComplaintSignalsGlobal: parseIntEnv("GROWTH_EXPANSION_MAX_COMPLAINT_SIGNALS", 99999),
  };
}
