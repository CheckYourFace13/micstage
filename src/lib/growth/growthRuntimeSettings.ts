/**
 * DB-backed growth/backlog operational knobs (non-secret).
 * Precedence: DB override → env → code default.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import type { SettingSource } from "@/lib/publicListings/claimInviteRuntimeSettings";

export const GROWTH_PIPELINE_RUNTIME_KEYS = [
  "GROWTH_SERPAPI_DAILY_MAX",
  "GROWTH_SERPAPI_MONTHLY_SOFT_MAX",
  "GROWTH_SERPAPI_RUNS_PER_DAY",
  "GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN",
  "LISTING_BACKLOG_PUBLISH_PER_TICK",
  "LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK",
  "LISTING_BACKLOG_PROMOTE_PER_TICK",
  "LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK",
  "GROWTH_OUTREACH_EVIDENCE_ENRICH_PER_TICK",
  "LISTING_AUTO_REJECT_JUNK_PER_RUN",
  "LISTING_VERIFIED_CONTACT_MINE_PER_TICK",
] as const;

export type GrowthPipelineRuntimeKey = (typeof GROWTH_PIPELINE_RUNTIME_KEYS)[number];

export type GrowthIntSetting = {
  key: GrowthPipelineRuntimeKey;
  envRaw: string | null;
  dbRaw: string | null;
  effective: number;
  source: SettingSource;
};

export type GrowthPipelineRuntimeSnapshot = {
  serpDailyMax: GrowthIntSetting;
  serpMonthlySoftMax: GrowthIntSetting;
  serpRunsPerDay: GrowthIntSetting;
  autonomousSearchCallsPerRun: GrowthIntSetting;
  backlogPublishPerTick: GrowthIntSetting;
  backlogGoogleVerifyPerTick: GrowthIntSetting;
  backlogPromotePerTick: GrowthIntSetting;
  backlogEvidenceEnrichPerTick: GrowthIntSetting;
  outreachEvidenceEnrichPerTick: GrowthIntSetting;
  autoRejectJunkPerRun: GrowthIntSetting;
  verifiedContactMinePerTick: GrowthIntSetting;
};

const DEFAULTS: Record<GrowthPipelineRuntimeKey, number> = {
  /** Soft ceiling per UTC day; free-plan allocation may be lower via Account API math. */
  GROWTH_SERPAPI_DAILY_MAX: 8,
  /** MicStage monthly SerpAPI budget on Free plan (~250 provider searches; leave margin). */
  GROWTH_SERPAPI_MONTHLY_SOFT_MAX: 220,
  /** Discovery cron may run 48×/day; SerpAPI run starts are independently capped. */
  GROWTH_SERPAPI_RUNS_PER_DAY: 6,
  /** One search query per Serp-backed adapter run on Free plan. */
  GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN: 1,
  LISTING_BACKLOG_PUBLISH_PER_TICK: 50,
  LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK: 30,
  LISTING_BACKLOG_PROMOTE_PER_TICK: 60,
  LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK: 30,
  GROWTH_OUTREACH_EVIDENCE_ENRICH_PER_TICK: 6,
  LISTING_AUTO_REJECT_JUNK_PER_RUN: 80,
  LISTING_VERIFIED_CONTACT_MINE_PER_TICK: 20,
};

const CLAMPS: Record<GrowthPipelineRuntimeKey, { min: number; max: number }> = {
  GROWTH_SERPAPI_DAILY_MAX: { min: 0, max: 500 },
  GROWTH_SERPAPI_MONTHLY_SOFT_MAX: { min: 0, max: 20000 },
  GROWTH_SERPAPI_RUNS_PER_DAY: { min: 0, max: 96 },
  GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN: { min: 1, max: 40 },
  LISTING_BACKLOG_PUBLISH_PER_TICK: { min: 0, max: 120 },
  LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK: { min: 0, max: 80 },
  LISTING_BACKLOG_PROMOTE_PER_TICK: { min: 0, max: 120 },
  LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK: { min: 0, max: 80 },
  GROWTH_OUTREACH_EVIDENCE_ENRICH_PER_TICK: { min: 0, max: 12 },
  LISTING_AUTO_REJECT_JUNK_PER_RUN: { min: 0, max: 300 },
  LISTING_VERIFIED_CONTACT_MINE_PER_TICK: { min: 0, max: 60 },
};

let runtimeCache: GrowthPipelineRuntimeSnapshot | null = null;

export function setGrowthPipelineRuntimeCache(snap: GrowthPipelineRuntimeSnapshot | null): void {
  runtimeCache = snap;
}

export function getGrowthPipelineRuntimeCache(): GrowthPipelineRuntimeSnapshot | null {
  return runtimeCache;
}

function parseIntRaw(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function clamp(key: GrowthPipelineRuntimeKey, n: number): number {
  const c = CLAMPS[key];
  return Math.min(c.max, Math.max(c.min, n));
}

function resolveOne(
  key: GrowthPipelineRuntimeKey,
  db: Map<string, string>,
): GrowthIntSetting {
  const envRaw = process.env[key]?.trim() || null;
  const dbRaw = db.get(key) ?? null;
  const dbN = parseIntRaw(dbRaw);
  const envN = parseIntRaw(envRaw);
  if (dbN !== null) {
    return { key, envRaw, dbRaw, effective: clamp(key, dbN), source: "database" };
  }
  if (envN !== null) {
    return { key, envRaw, dbRaw, effective: clamp(key, envN), source: "environment" };
  }
  return { key, envRaw, dbRaw, effective: DEFAULTS[key], source: "default" };
}

export async function resolveGrowthPipelineRuntimeSnapshot(
  prisma: PrismaClient,
): Promise<GrowthPipelineRuntimeSnapshot> {
  const rows = await prisma.operationalRuntimeSetting.findMany({
    where: { key: { in: [...GROWTH_PIPELINE_RUNTIME_KEYS] } },
    select: { key: true, value: true },
  });
  const db = new Map(rows.map((r) => [r.key, r.value]));
  const snap: GrowthPipelineRuntimeSnapshot = {
    serpDailyMax: resolveOne("GROWTH_SERPAPI_DAILY_MAX", db),
    serpMonthlySoftMax: resolveOne("GROWTH_SERPAPI_MONTHLY_SOFT_MAX", db),
    serpRunsPerDay: resolveOne("GROWTH_SERPAPI_RUNS_PER_DAY", db),
    autonomousSearchCallsPerRun: resolveOne("GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN", db),
    backlogPublishPerTick: resolveOne("LISTING_BACKLOG_PUBLISH_PER_TICK", db),
    backlogGoogleVerifyPerTick: resolveOne("LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK", db),
    backlogPromotePerTick: resolveOne("LISTING_BACKLOG_PROMOTE_PER_TICK", db),
    backlogEvidenceEnrichPerTick: resolveOne("LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK", db),
    outreachEvidenceEnrichPerTick: resolveOne("GROWTH_OUTREACH_EVIDENCE_ENRICH_PER_TICK", db),
    autoRejectJunkPerRun: resolveOne("LISTING_AUTO_REJECT_JUNK_PER_RUN", db),
    verifiedContactMinePerTick: resolveOne("LISTING_VERIFIED_CONTACT_MINE_PER_TICK", db),
  };
  setGrowthPipelineRuntimeCache(snap);
  return snap;
}

export function growthRuntimeSnapshotForStatus(snap: GrowthPipelineRuntimeSnapshot) {
  const pack = (s: GrowthIntSetting) => ({
    env: s.envRaw ?? "missing",
    database: s.dbRaw,
    effective: s.effective,
    source: s.source,
  });
  return {
    GROWTH_SERPAPI_DAILY_MAX: pack(snap.serpDailyMax),
    GROWTH_SERPAPI_MONTHLY_SOFT_MAX: pack(snap.serpMonthlySoftMax),
    GROWTH_SERPAPI_RUNS_PER_DAY: pack(snap.serpRunsPerDay),
    GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN: pack(snap.autonomousSearchCallsPerRun),
    LISTING_BACKLOG_PUBLISH_PER_TICK: pack(snap.backlogPublishPerTick),
    LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK: pack(snap.backlogGoogleVerifyPerTick),
    LISTING_BACKLOG_PROMOTE_PER_TICK: pack(snap.backlogPromotePerTick),
    LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK: pack(snap.backlogEvidenceEnrichPerTick),
    GROWTH_OUTREACH_EVIDENCE_ENRICH_PER_TICK: pack(snap.outreachEvidenceEnrichPerTick),
    LISTING_AUTO_REJECT_JUNK_PER_RUN: pack(snap.autoRejectJunkPerRun),
    LISTING_VERIFIED_CONTACT_MINE_PER_TICK: pack(snap.verifiedContactMinePerTick),
  };
}

/** Seed intended production values into OperationalRuntimeSetting (idempotent). */
export async function seedGrowthPipelineRuntimeDefaults(
  prisma: PrismaClient,
  updatedBy = "system:seed-growth-runtime",
): Promise<{ key: string; value: string }[]> {
  const out: { key: string; value: string }[] = [];
  for (const key of GROWTH_PIPELINE_RUNTIME_KEYS) {
    const value = DEFAULTS[key];
    // Direct upsert — validateClaimInviteRuntimeValue only knows claim keys.
    await prisma.operationalRuntimeSetting.upsert({
      where: { key },
      create: {
        key,
        valueType: "integer",
        value: String(value),
        updatedBy,
        reason: "seed_growth_pipeline_defaults",
      },
      update: {
        valueType: "integer",
        value: String(value),
        updatedBy,
        reason: "seed_growth_pipeline_defaults",
      },
    });
    out.push({ key, value: String(value) });
  }
  return out;
}

/** Sync readers used by Serp/backlog — prefer request-scoped cache. */
export function effectiveSerpDailyMax(): number {
  return runtimeCache?.serpDailyMax.effective ?? parseIntEnv("GROWTH_SERPAPI_DAILY_MAX", DEFAULTS.GROWTH_SERPAPI_DAILY_MAX);
}
export function effectiveSerpMonthlySoftMax(): number {
  return (
    runtimeCache?.serpMonthlySoftMax.effective ??
    parseIntEnv("GROWTH_SERPAPI_MONTHLY_SOFT_MAX", DEFAULTS.GROWTH_SERPAPI_MONTHLY_SOFT_MAX)
  );
}
export function effectiveSerpRunsPerDay(): number {
  return (
    runtimeCache?.serpRunsPerDay.effective ??
    parseIntEnv("GROWTH_SERPAPI_RUNS_PER_DAY", DEFAULTS.GROWTH_SERPAPI_RUNS_PER_DAY)
  );
}
export function effectiveAutonomousSearchCallsPerRun(): number {
  return (
    runtimeCache?.autonomousSearchCallsPerRun.effective ??
    parseIntEnv(
      "GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN",
      DEFAULTS.GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN,
    )
  );
}
