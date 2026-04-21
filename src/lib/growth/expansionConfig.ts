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

/** When true, POST /api/cron/growth-pipeline may run discovery adapters (market list: `GROWTH_DISCOVERY_MARKET_SLUGS` or primary launch slug from `marketsConfig`). */
export function growthLeadDiscoveryCronEnabled(): boolean {
  return process.env.GROWTH_LEAD_DISCOVERY_CRON_ENABLED === "true";
}

/**
 * Max candidates each adapter may emit per market per cron run (ingestion + dedupe still apply).
 * Keeps discovery throttled on large stub JSON batches.
 */
export function growthDiscoveryMaxCandidatesPerAdapterPerMarket(): number {
  /** High-volume autonomous runs: raise to 400–800; combine with frequent cron for 500+ new leads/day (dedupe reduces net). */
  return parseIntEnv("GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER", 250);
}

/** When true, cron may auto-create drafts; top VENUE leads may auto-approve/send in ACTIVE launch markets. */
export function growthAutoDraftCronEnabled(): boolean {
  return process.env.GROWTH_AUTO_DRAFT_CRON_ENABLED === "true";
}

export function growthAutoDraftFitMin(): number {
  const v = process.env.GROWTH_AUTO_DRAFT_FIT_MIN?.trim();
  if (!v) return 7;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 7;
}

export function growthAutoDraftBatchLimit(): number {
  return parseIntEnv("GROWTH_AUTO_DRAFT_BATCH_LIMIT", 100);
}

/**
 * Successful growth outreach sends attempted per `/api/cron/growth-pipeline` run (after draft automation).
 * Still bounded by the effective daily OUTREACH max (see {@link growthOutreachDailyMax}) and marketing caps.
 * Default 3; clamp 1–50 so frequent crons can drain a 50/day budget without huge bursts per tick.
 */
export function growthOutreachSendsPerCronRun(): number {
  const n = parseIntEnv("GROWTH_OUTREACH_SENDS_PER_CRON_RUN", 3);
  return Math.min(50, Math.max(1, n));
}

/** Soft daily goal for growth automation (logging / ordering only — never forces junk sends). */
export function growthOutreachDailyTarget(): number {
  return parseIntEnv("GROWTH_OUTREACH_DAILY_TARGET", 30);
}

/** Hard daily ceiling for growth outreach automation (combined with MARKETING_CAP_DAILY_OUTREACH via min). */
export function growthOutreachDailyMax(): number {
  return parseIntEnv("GROWTH_OUTREACH_DAILY_MAX", 50);
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
