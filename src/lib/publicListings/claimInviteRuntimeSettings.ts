/**
 * Database-backed operational runtime settings (claim-invite gates + outreach caps).
 * Never stores secrets — only non-secret operational gates.
 *
 * Precedence (claim invites):
 * 1. Env kill true → always stop
 * 2. DB kill true → stop
 * 3. DB operational value when present
 * 4. Env operational value
 * 5. Safe defaults (enabled=false, perCron=0, dailyMax=10, kill=false)
 *
 * Precedence (outreach sends per cron):
 * 1. DB value when present
 * 2. Env value when present
 * 3. Safe default 0 (non-sending)
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { OUTREACH_RUNTIME_KEYS } from "@/lib/growth/outreachRuntimeSettings";
import {
  validateOutreachRuntimeValue,
  type OutreachRuntimeKey as GrowthOutreachRuntimeKey,
} from "@/lib/growth/outreachRuntimeSettings";

export const CLAIM_INVITE_RUNTIME_KEYS = [
  "MICSTAGE_CLAIM_INVITES_ENABLED",
  "LISTING_CLAIM_INVITES_PER_CRON",
  "MICSTAGE_CLAIM_INVITES_DAILY_MAX",
  "MICSTAGE_KILL_CLAIM_INVITES",
] as const;

export const OUTREACH_RUNTIME_KEYS_REEXPORT = OUTREACH_RUNTIME_KEYS;

export const OPERATIONAL_RUNTIME_KEYS = [
  ...CLAIM_INVITE_RUNTIME_KEYS,
  ...OUTREACH_RUNTIME_KEYS,
] as const;

export type ClaimInviteRuntimeKey = (typeof CLAIM_INVITE_RUNTIME_KEYS)[number];
export type OutreachRuntimeKey = GrowthOutreachRuntimeKey;
export type OperationalRuntimeKey = (typeof OPERATIONAL_RUNTIME_KEYS)[number];

export type SettingSource = "env_kill" | "db_kill" | "database" | "environment" | "default";

export type ResolvedBoolSetting = {
  key: ClaimInviteRuntimeKey;
  envRaw: string | null;
  dbRaw: string | null;
  effective: boolean;
  effectiveLabel: "enabled" | "disabled";
  source: SettingSource;
};

export type ResolvedIntSetting = {
  key: OperationalRuntimeKey;
  envRaw: string | null;
  dbRaw: string | null;
  effective: number;
  source: SettingSource;
};

export type ClaimInviteRuntimeSnapshot = {
  kill: ResolvedBoolSetting;
  enabled: ResolvedBoolSetting;
  perCron: ResolvedIntSetting;
  dailyMax: ResolvedIntSetting;
  outreachSendsPerCron: ResolvedIntSetting;
  /** Final send gate after kill + enabled. */
  claimInvitesEnabled: boolean;
  /** Per-cron after canary cap. */
  effectivePerCron: number;
  /** Effective general outreach sends per cron (0 = off). */
  effectiveOutreachSendsPerCron: number;
  canaryMode: boolean;
};

function envTruthy(v: string | undefined | null): boolean {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function envFalsyExplicit(v: string | undefined | null): boolean {
  const s = v?.trim().toLowerCase();
  return s === "false" || s === "0" || s === "no" || s === "off";
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

function listingClaimInviteCanaryMax(): number {
  return Math.min(20, Math.max(0, parseIntEnv("LISTING_CLAIM_INVITES_CANARY_MAX", 5)));
}

function canaryModeOn(): boolean {
  return !envFalsyExplicit(process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE);
}

export function isOutreachRuntimeKey(key: string): key is OutreachRuntimeKey {
  return (OUTREACH_RUNTIME_KEYS as readonly string[]).includes(key);
}

export function isClaimInviteRuntimeKey(key: string): key is ClaimInviteRuntimeKey {
  return (CLAIM_INVITE_RUNTIME_KEYS as readonly string[]).includes(key);
}

export function isOperationalRuntimeKey(key: string): key is OperationalRuntimeKey {
  return (OPERATIONAL_RUNTIME_KEYS as readonly string[]).includes(key);
}

export async function loadOperationalRuntimeDbMap(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const rows = await prisma.operationalRuntimeSetting.findMany({
    where: { key: { in: [...OPERATIONAL_RUNTIME_KEYS] } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** @deprecated Prefer loadOperationalRuntimeDbMap */
export async function loadClaimInviteRuntimeDbMap(prisma: PrismaClient) {
  return loadOperationalRuntimeDbMap(prisma);
}

export async function resolveClaimInviteRuntimeSnapshot(
  prisma: PrismaClient,
): Promise<ClaimInviteRuntimeSnapshot> {
  const db = await loadOperationalRuntimeDbMap(prisma);

  const envKillRaw = process.env.MICSTAGE_KILL_CLAIM_INVITES?.trim() || null;
  const dbKillRaw = db.get("MICSTAGE_KILL_CLAIM_INVITES") ?? null;
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
    key: "MICSTAGE_KILL_CLAIM_INVITES",
    envRaw: envKillRaw,
    dbRaw: dbKillRaw,
    effective: killEffective,
    effectiveLabel: boolLabel(killEffective),
    source: killSource,
  };

  const envEnabledRaw = process.env.MICSTAGE_CLAIM_INVITES_ENABLED?.trim() || null;
  const dbEnabledRaw = db.get("MICSTAGE_CLAIM_INVITES_ENABLED") ?? null;
  let enabledValue = false;
  let enabledSource: SettingSource = "default";
  const dbEnabled = parseBoolRaw(dbEnabledRaw);
  const envEnabled = parseBoolRaw(envEnabledRaw);
  if (dbEnabled !== null) {
    enabledValue = dbEnabled;
    enabledSource = "database";
  } else if (envEnabled !== null) {
    enabledValue = envEnabled;
    enabledSource = "environment";
  }

  const enabled: ResolvedBoolSetting = {
    key: "MICSTAGE_CLAIM_INVITES_ENABLED",
    envRaw: envEnabledRaw,
    dbRaw: dbEnabledRaw,
    effective: enabledValue,
    effectiveLabel: boolLabel(enabledValue),
    source: enabledSource,
  };

  const envPerCronRaw = process.env.LISTING_CLAIM_INVITES_PER_CRON?.trim() || null;
  const dbPerCronRaw = db.get("LISTING_CLAIM_INVITES_PER_CRON") ?? null;
  let perCronValue = 0;
  let perCronSource: SettingSource = "default";
  const dbPer = parseIntRaw(dbPerCronRaw);
  const envPer = parseIntRaw(envPerCronRaw);
  if (dbPer !== null) {
    perCronValue = Math.min(20, Math.max(0, dbPer));
    perCronSource = "database";
  } else if (envPer !== null) {
    perCronValue = Math.min(20, Math.max(0, envPer));
    perCronSource = "environment";
  }

  const perCron: ResolvedIntSetting = {
    key: "LISTING_CLAIM_INVITES_PER_CRON",
    envRaw: envPerCronRaw,
    dbRaw: dbPerCronRaw,
    effective: perCronValue,
    source: perCronSource,
  };

  const envDailyRaw = process.env.MICSTAGE_CLAIM_INVITES_DAILY_MAX?.trim() || null;
  const dbDailyRaw = db.get("MICSTAGE_CLAIM_INVITES_DAILY_MAX") ?? null;
  let dailyValue = 10;
  let dailySource: SettingSource = "default";
  const dbDaily = parseIntRaw(dbDailyRaw);
  const envDaily = parseIntRaw(envDailyRaw);
  if (dbDaily !== null) {
    dailyValue = Math.min(50, Math.max(0, dbDaily));
    dailySource = "database";
  } else if (envDaily !== null) {
    dailyValue = Math.min(50, Math.max(0, envDaily));
    dailySource = "environment";
  }

  const dailyMax: ResolvedIntSetting = {
    key: "MICSTAGE_CLAIM_INVITES_DAILY_MAX",
    envRaw: envDailyRaw,
    dbRaw: dbDailyRaw,
    effective: dailyValue,
    source: dailySource,
  };

  const envOutreachRaw = process.env.GROWTH_OUTREACH_SENDS_PER_CRON_RUN?.trim() || null;
  const dbOutreachRaw = db.get("GROWTH_OUTREACH_SENDS_PER_CRON_RUN") ?? null;
  // Safe default: 0 (non-sending) when neither DB nor env is set.
  let outreachValue = 0;
  let outreachSource: SettingSource = "default";
  const dbOutreach = parseIntRaw(dbOutreachRaw);
  const envOutreach = parseIntRaw(envOutreachRaw);
  if (dbOutreach !== null) {
    outreachValue = Math.min(50, Math.max(0, dbOutreach));
    outreachSource = "database";
  } else if (envOutreach !== null) {
    outreachValue = Math.min(50, Math.max(0, envOutreach));
    outreachSource = "environment";
  }

  const outreachSendsPerCron: ResolvedIntSetting = {
    key: "GROWTH_OUTREACH_SENDS_PER_CRON_RUN",
    envRaw: envOutreachRaw,
    dbRaw: dbOutreachRaw,
    effective: outreachValue,
    source: outreachSource,
  };

  const claimInvitesEnabled = !killEffective && enabledValue;
  let effectivePerCron = 0;
  if (claimInvitesEnabled) {
    effectivePerCron = perCronValue;
    if (canaryModeOn()) {
      effectivePerCron = Math.min(effectivePerCron, listingClaimInviteCanaryMax());
    }
  }

  return {
    kill,
    enabled,
    perCron,
    dailyMax,
    outreachSendsPerCron,
    claimInvitesEnabled,
    effectivePerCron,
    effectiveOutreachSendsPerCron: outreachValue,
    canaryMode: canaryModeOn(),
  };
}

export function validateClaimInviteRuntimeValue(
  key: OperationalRuntimeKey,
  value: unknown,
): { ok: true; valueType: "boolean" | "integer"; stored: string } | { ok: false; error: string } {
  if (isOutreachRuntimeKey(key)) {
    return validateOutreachRuntimeValue(key, value);
  }
  if (typeof value === "boolean") {
    if (key === "MICSTAGE_CLAIM_INVITES_ENABLED" || key === "MICSTAGE_KILL_CLAIM_INVITES") {
      return { ok: true, valueType: "boolean", stored: value ? "true" : "false" };
    }
    return { ok: false, error: "boolean_not_allowed_for_key" };
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    if (key === "LISTING_CLAIM_INVITES_PER_CRON") {
      if (value < 0 || value > 20) return { ok: false, error: "per_cron_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(value) };
    }
    if (key === "MICSTAGE_CLAIM_INVITES_DAILY_MAX") {
      if (value < 0 || value > 50) return { ok: false, error: "daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(value) };
    }
    return { ok: false, error: "integer_not_allowed_for_key" };
  }
  if (typeof value === "string") {
    const bool = parseBoolRaw(value);
    if (bool !== null && (key === "MICSTAGE_CLAIM_INVITES_ENABLED" || key === "MICSTAGE_KILL_CLAIM_INVITES")) {
      return { ok: true, valueType: "boolean", stored: bool ? "true" : "false" };
    }
    const n = parseIntRaw(value);
    if (n !== null && key === "LISTING_CLAIM_INVITES_PER_CRON") {
      if (n < 0 || n > 20) return { ok: false, error: "per_cron_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(n) };
    }
    if (n !== null && key === "MICSTAGE_CLAIM_INVITES_DAILY_MAX") {
      if (n < 0 || n > 50) return { ok: false, error: "daily_max_out_of_range" };
      return { ok: true, valueType: "integer", stored: String(n) };
    }
  }
  return { ok: false, error: "invalid_value" };
}

export async function upsertClaimInviteRuntimeSetting(
  prisma: PrismaClient,
  input: {
    key: OperationalRuntimeKey;
    value: unknown;
    updatedBy: string;
    reason?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<{ ok: true; key: string; value: string; valueType: string } | { ok: false; error: string }> {
  const validated = validateClaimInviteRuntimeValue(input.key, input.value);
  if (!validated.ok) return validated;

  await prisma.operationalRuntimeSetting.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      valueType: validated.valueType,
      value: validated.stored,
      updatedBy: input.updatedBy,
      reason: input.reason ?? null,
      meta: (input.meta ?? undefined) as object | undefined,
    },
    update: {
      valueType: validated.valueType,
      value: validated.stored,
      updatedBy: input.updatedBy,
      reason: input.reason ?? null,
      meta: (input.meta ?? undefined) as object | undefined,
    },
  });

  return { ok: true, key: input.key, value: validated.stored, valueType: validated.valueType };
}

export function runtimeSnapshotForStatus(snap: ClaimInviteRuntimeSnapshot) {
  const envBoolLabel = (raw: string | null): "enabled" | "disabled" | "missing" => {
    if (raw === null || raw === "") return "missing";
    const p = parseBoolRaw(raw);
    if (p === true) return "enabled";
    if (p === false) return "disabled";
    return "missing";
  };
  const dbBoolLabel = (raw: string | null): "enabled" | "disabled" | null => {
    if (raw === null) return null;
    const p = parseBoolRaw(raw);
    if (p === true) return "enabled";
    if (p === false) return "disabled";
    return null;
  };

  return {
    MICSTAGE_KILL_CLAIM_INVITES: {
      env: envBoolLabel(snap.kill.envRaw),
      database: dbBoolLabel(snap.kill.dbRaw),
      effective: snap.kill.effectiveLabel,
      source: snap.kill.source,
    },
    MICSTAGE_CLAIM_INVITES_ENABLED: {
      env: envBoolLabel(snap.enabled.envRaw),
      database: dbBoolLabel(snap.enabled.dbRaw),
      effective: snap.enabled.effectiveLabel,
      source: snap.enabled.source,
    },
    LISTING_CLAIM_INVITES_PER_CRON: {
      env: snap.perCron.envRaw ?? "missing",
      database: snap.perCron.dbRaw,
      effective: snap.perCron.effective,
      source: snap.perCron.source,
    },
    MICSTAGE_CLAIM_INVITES_DAILY_MAX: {
      env: snap.dailyMax.envRaw ?? "missing",
      database: snap.dailyMax.dbRaw,
      effective: snap.dailyMax.effective,
      source: snap.dailyMax.source,
    },
    GROWTH_OUTREACH_SENDS_PER_CRON_RUN: {
      env: snap.outreachSendsPerCron.envRaw ?? "missing",
      database: snap.outreachSendsPerCron.dbRaw,
      effective: snap.outreachSendsPerCron.effective,
      source: snap.outreachSendsPerCron.source,
    },
    claimInvitesEnabled: snap.claimInvitesEnabled ? "enabled" : "disabled",
    effectivePerCron: snap.effectivePerCron,
    effectiveOutreachSendsPerCron: snap.effectiveOutreachSendsPerCron,
    canaryMode: snap.canaryMode,
  };
}
