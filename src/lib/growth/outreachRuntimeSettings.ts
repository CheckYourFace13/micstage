/**
 * DB-backed general marketing outreach runtime controls (non-secret).
 *
 * Precedence (outreach):
 * 1. Env kill true → always stop
 * 2. DB kill true → stop
 * 3. GROWTH_OUTREACH_ENABLED=false → stop
 * 4. Operational caps from DB → env → defaults
 * 5. Health throttle may reduce effective sends (see outreachHealthThrottle)
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import type { SettingSource } from "@/lib/publicListings/claimInviteRuntimeSettings";
import {
  clampOutreachDailyMaxForRlsGate,
  isDatabaseRlsSecurityGateClear,
} from "@/lib/database/databaseRlsSecurity";

export const OUTREACH_RUNTIME_KEYS = [
  "GROWTH_OUTREACH_ENABLED",
  "GROWTH_OUTREACH_KILL",
  "GROWTH_OUTREACH_DAILY_MAX",
  "GROWTH_OUTREACH_SENDS_PER_CRON_RUN",
  "GROWTH_OUTREACH_DOMAIN_DAILY_MAX",
] as const;

export type OutreachRuntimeKey = (typeof OUTREACH_RUNTIME_KEYS)[number];

export type ResolvedBoolSetting = {
  key: "GROWTH_OUTREACH_ENABLED" | "GROWTH_OUTREACH_KILL";
  envRaw: string | null;
  dbRaw: string | null;
  effective: boolean;
  effectiveLabel: "enabled" | "disabled";
  source: SettingSource;
};

export type ResolvedIntSetting = {
  key: OutreachRuntimeKey;
  envRaw: string | null;
  dbRaw: string | null;
  effective: number;
  source: SettingSource;
};

export type OutreachRuntimeSnapshot = {
  kill: ResolvedBoolSetting;
  enabled: ResolvedBoolSetting;
  dailyMax: ResolvedIntSetting;
  sendsPerCron: ResolvedIntSetting;
  domainDailyMax: ResolvedIntSetting;
  /** Final gate: !kill && enabled */
  outreachMasterEnabled: boolean;
  effectiveSendsPerCron: number;
  effectiveDailyMax: number;
  effectiveDomainDailyMax: number;
};

const INT_DEFAULTS: Record<
  "GROWTH_OUTREACH_DAILY_MAX" | "GROWTH_OUTREACH_SENDS_PER_CRON_RUN" | "GROWTH_OUTREACH_DOMAIN_DAILY_MAX",
  number
> = {
  GROWTH_OUTREACH_DAILY_MAX: 25,
  GROWTH_OUTREACH_SENDS_PER_CRON_RUN: 0,
  GROWTH_OUTREACH_DOMAIN_DAILY_MAX: 1,
};

function envTruthy(v: string | undefined | null): boolean {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function parseBoolRaw(raw: string | null | undefined): boolean | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const s = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return null;
}

function parseIntRaw(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function boolLabel(v: boolean): "enabled" | "disabled" {
  return v ? "enabled" : "disabled";
}

function resolveBool(
  key: ResolvedBoolSetting["key"],
  db: Map<string, string>,
  envKey: string,
  defaultValue: boolean,
): ResolvedBoolSetting {
  const envRaw = process.env[envKey]?.trim() || null;
  const dbRaw = db.get(key) ?? null;
  const dbVal = parseBoolRaw(dbRaw);
  const envVal = parseBoolRaw(envRaw);
  if (dbVal !== null) {
    return { key, envRaw, dbRaw, effective: dbVal, effectiveLabel: boolLabel(dbVal), source: "database" };
  }
  if (envVal !== null) {
    return { key, envRaw, dbRaw, effective: envVal, effectiveLabel: boolLabel(envVal), source: "environment" };
  }
  return {
    key,
    envRaw,
    dbRaw,
    effective: defaultValue,
    effectiveLabel: boolLabel(defaultValue),
    source: "default",
  };
}

function resolveInt(
  key: "GROWTH_OUTREACH_DAILY_MAX" | "GROWTH_OUTREACH_SENDS_PER_CRON_RUN" | "GROWTH_OUTREACH_DOMAIN_DAILY_MAX",
  db: Map<string, string>,
  clamp: { min: number; max: number },
): ResolvedIntSetting {
  const envRaw = process.env[key]?.trim() || null;
  const dbRaw = db.get(key) ?? null;
  const dbN = parseIntRaw(dbRaw);
  const envN = parseIntRaw(envRaw);
  const fallback = INT_DEFAULTS[key];
  if (dbN !== null) {
    return { key, envRaw, dbRaw, effective: Math.min(clamp.max, Math.max(clamp.min, dbN)), source: "database" };
  }
  if (envN !== null) {
    return { key, envRaw, dbRaw, effective: Math.min(clamp.max, Math.max(clamp.min, envN)), source: "environment" };
  }
  return { key, envRaw, dbRaw, effective: fallback, source: "default" };
}

export async function loadOutreachRuntimeDbMap(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.operationalRuntimeSetting.findMany({
    where: { key: { in: [...OUTREACH_RUNTIME_KEYS] } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function resolveOutreachRuntimeSnapshot(prisma: PrismaClient): Promise<OutreachRuntimeSnapshot> {
  const db = await loadOutreachRuntimeDbMap(prisma);

  const envKillRaw = process.env.GROWTH_OUTREACH_KILL?.trim() || process.env.MICSTAGE_KILL_GROWTH_OUTREACH?.trim() || null;
  const dbKillRaw = db.get("GROWTH_OUTREACH_KILL") ?? null;
  const envKill = envTruthy(envKillRaw);
  const dbKill = parseBoolRaw(dbKillRaw) === true;

  let killEffective = false;
  let killSource: SettingSource = "default";
  if (envKill) {
    killEffective = true;
    killSource = "env_kill";
  } else if (dbKill) {
    killEffective = true;
    killSource = "db_kill";
  } else if (parseBoolRaw(dbKillRaw) === false) {
    killEffective = false;
    killSource = "database";
  } else if (parseBoolRaw(envKillRaw) === false) {
    killEffective = false;
    killSource = "environment";
  }

  const kill: ResolvedBoolSetting = {
    key: "GROWTH_OUTREACH_KILL",
    envRaw: envKillRaw,
    dbRaw: dbKillRaw,
    effective: killEffective,
    effectiveLabel: boolLabel(killEffective),
    source: killSource,
  };

  const enabledBase = resolveBool("GROWTH_OUTREACH_ENABLED", db, "GROWTH_OUTREACH_ENABLED", false);
  const enabled: ResolvedBoolSetting = {
    ...enabledBase,
    effective: !killEffective && enabledBase.effective,
    effectiveLabel: boolLabel(!killEffective && enabledBase.effective),
    source: killEffective ? killSource : enabledBase.source,
  };

  const dailyMax = resolveInt("GROWTH_OUTREACH_DAILY_MAX", db, { min: 0, max: 100 });
  const sendsPerCron = resolveInt("GROWTH_OUTREACH_SENDS_PER_CRON_RUN", db, { min: 0, max: 50 });
  const domainDailyMax = resolveInt("GROWTH_OUTREACH_DOMAIN_DAILY_MAX", db, { min: 0, max: 10 });

  const outreachMasterEnabled = !killEffective && enabledBase.effective;
  const rlsGateClear = await isDatabaseRlsSecurityGateClear(prisma);
  const effectiveSendsPerCron = outreachMasterEnabled ? sendsPerCron.effective : 0;
  const effectiveDailyMax = outreachMasterEnabled
    ? clampOutreachDailyMaxForRlsGate(dailyMax.effective, rlsGateClear)
    : 0;
  const effectiveDomainDailyMax = outreachMasterEnabled ? domainDailyMax.effective : 0;

  return {
    kill,
    enabled,
    dailyMax,
    sendsPerCron,
    domainDailyMax,
    outreachMasterEnabled,
    effectiveSendsPerCron,
    effectiveDailyMax,
    effectiveDomainDailyMax,
  };
}

export function isOutreachRuntimeKey(key: string): key is OutreachRuntimeKey {
  return (OUTREACH_RUNTIME_KEYS as readonly string[]).includes(key);
}

export function validateOutreachRuntimeValue(
  key: OutreachRuntimeKey,
  value: unknown,
): { ok: true; valueType: "boolean" | "integer"; stored: string } | { ok: false; error: string } {
  if (typeof value === "boolean") {
    if (key === "GROWTH_OUTREACH_ENABLED" || key === "GROWTH_OUTREACH_KILL") {
      return { ok: true, valueType: "boolean", stored: value ? "true" : "false" };
    }
    return { ok: false, error: "boolean_not_allowed_for_key" };
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    if (key === "GROWTH_OUTREACH_DAILY_MAX") {
      if (value < 0 || value > 100) return { ok: false, error: "daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(value) };
    }
    if (key === "GROWTH_OUTREACH_SENDS_PER_CRON_RUN") {
      if (value < 0 || value > 50) return { ok: false, error: "outreach_per_cron_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(value) };
    }
    if (key === "GROWTH_OUTREACH_DOMAIN_DAILY_MAX") {
      if (value < 0 || value > 10) return { ok: false, error: "domain_daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(value) };
    }
    return { ok: false, error: "integer_not_allowed_for_key" };
  }
  if (typeof value === "string") {
    const bool = parseBoolRaw(value);
    if (bool !== null && (key === "GROWTH_OUTREACH_ENABLED" || key === "GROWTH_OUTREACH_KILL")) {
      return { ok: true, valueType: "boolean", stored: bool ? "true" : "false" };
    }
    const n = parseIntRaw(value);
    if (n !== null && key === "GROWTH_OUTREACH_DAILY_MAX") {
      if (n < 0 || n > 100) return { ok: false, error: "daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(n) };
    }
    if (n !== null && key === "GROWTH_OUTREACH_SENDS_PER_CRON_RUN") {
      if (n < 0 || n > 50) return { ok: false, error: "outreach_per_cron_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(n) };
    }
    if (n !== null && key === "GROWTH_OUTREACH_DOMAIN_DAILY_MAX") {
      if (n < 0 || n > 10) return { ok: false, error: "domain_daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(n) };
    }
  }
  return { ok: false, error: "invalid_value" };
}

export function outreachRuntimeSnapshotForStatus(snap: OutreachRuntimeSnapshot) {
  const packBool = (s: ResolvedBoolSetting) => ({
    env: s.envRaw ?? "missing",
    database: s.dbRaw,
    effective: s.effectiveLabel,
    source: s.source,
  });
  const packInt = (s: ResolvedIntSetting) => ({
    env: s.envRaw ?? "missing",
    database: s.dbRaw,
    effective: s.effective,
    source: s.source,
  });
  return {
    GROWTH_OUTREACH_KILL: packBool(snap.kill),
    GROWTH_OUTREACH_ENABLED: packBool(snap.enabled),
    GROWTH_OUTREACH_DAILY_MAX: packInt(snap.dailyMax),
    GROWTH_OUTREACH_SENDS_PER_CRON_RUN: packInt(snap.sendsPerCron),
    GROWTH_OUTREACH_DOMAIN_DAILY_MAX: packInt(snap.domainDailyMax),
    outreachMasterEnabled: snap.outreachMasterEnabled ? "enabled" : "disabled",
    effectiveSendsPerCron: snap.effectiveSendsPerCron,
    effectiveDailyMax: snap.effectiveDailyMax,
    effectiveDomainDailyMax: snap.effectiveDomainDailyMax,
  };
}

/** Env-only transactional reserve slots held back from marketing on the shared Resend daily budget. */
export function micstageTransactionalReserveSlots(): number {
  return parseIntEnv("MICSTAGE_RESEND_TRANSACTIONAL_RESERVE", 35);
}
