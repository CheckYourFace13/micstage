import type { PrismaClient } from "@/generated/prisma/client";
import {
  growthSerpApiCooldownHoursOn429,
  growthSerpApiDailyMax,
  growthSerpApiMonthlySoftMax,
  growthSerpApiRunsPerDay,
  serpApiKeyForDiscovery,
} from "@/lib/growth/discovery/autonomousConfig";
import {
  readDiscoveryCursorJson,
  writeDiscoveryCursorJson,
} from "@/lib/growth/discovery/discoveryCursor";

const PROVIDER_ADAPTER_ID = "__provider__";
const SERP_STATE_KEY = "serpapi_state";

/** Free Account API — does not consume search quota. */
const ACCOUNT_PROBE_MIN_MS_WHEN_DISABLED = 6 * 60 * 60 * 1000;
const ACCOUNT_PROBE_MIN_MS_WHEN_ENABLED = 24 * 60 * 60 * 1000;

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export type SerpApiAccountSnapshot = {
  planId: string | null;
  planName: string | null;
  searchesPerMonth: number | null;
  planSearchesLeft: number | null;
  thisMonthUsage: number | null;
  totalSearchesLeft: number | null;
  /** ISO date (YYYY-MM-DD) or full ISO when provided by SerpAPI. */
  planRenewalDate: string | null;
  probedAtIso: string;
};

export type SerpApiProviderState = {
  dayKey: string;
  monthKey: string;
  callsToday: number;
  callsMonth: number;
  runsToday: number;
  lastRunDayKey: string | null;
  disabledUntilIso: string | null;
  last429AtIso: string | null;
  reason: string | null;
  /** Last free Account API snapshot (no search quota cost). */
  account: SerpApiAccountSnapshot | null;
  /** Computed daily SerpAPI call budget for today (persisted for ops). */
  dailyAllocation: number | null;
};

function freshState(now: Date): SerpApiProviderState {
  return {
    dayKey: utcDayKey(now),
    monthKey: utcMonthKey(now),
    callsToday: 0,
    callsMonth: 0,
    runsToday: 0,
    lastRunDayKey: null,
    disabledUntilIso: null,
    last429AtIso: null,
    reason: null,
    account: null,
    dailyAllocation: null,
  };
}

function normalizedState(state: SerpApiProviderState | null, now: Date): SerpApiProviderState {
  const out = { ...freshState(now), ...(state ?? {}) };
  const day = utcDayKey(now);
  const month = utcMonthKey(now);
  if (out.dayKey !== day) {
    out.dayKey = day;
    out.callsToday = 0;
    out.runsToday = 0;
  }
  if (out.monthKey !== month) {
    out.monthKey = month;
    out.callsMonth = 0;
  }
  if (out.account === undefined) out.account = null;
  if (out.dailyAllocation === undefined) out.dailyAllocation = null;
  return out;
}

export async function readSerpApiProviderState(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
): Promise<SerpApiProviderState> {
  const state = await readDiscoveryCursorJson<SerpApiProviderState>(
    prisma,
    PROVIDER_ADAPTER_ID,
    marketSlug,
    SERP_STATE_KEY,
  );
  return normalizedState(state, now);
}

async function writeSerpApiProviderState(
  prisma: PrismaClient,
  marketSlug: string,
  state: SerpApiProviderState,
): Promise<void> {
  await writeDiscoveryCursorJson(prisma, PROVIDER_ADAPTER_ID, marketSlug, SERP_STATE_KEY, state);
}

export async function markSerpApiRunStarted(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
): Promise<SerpApiProviderState> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
  const day = utcDayKey(now);
  if (s.lastRunDayKey !== day) {
    s.lastRunDayKey = day;
  }
  s.runsToday += 1;
  await writeSerpApiProviderState(prisma, marketSlug, s);
  return s;
}

export async function markSerpApiCall(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
): Promise<SerpApiProviderState> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
  s.callsToday += 1;
  s.callsMonth += 1;
  await writeSerpApiProviderState(prisma, marketSlug, s);
  return s;
}

/**
 * Circuit-breaker after SerpAPI HTTP 429.
 * Monthly exhaustion disables until provider renewal date (Account API) when known,
 * else UTC month rollover. Auto-recovery still clears early when Account API shows searches left.
 */
export async function disableSerpApiOnQuota429(
  prisma: PrismaClient,
  marketSlug: string,
  reason: string,
  now: Date = new Date(),
  opts?: { kind?: "monthly_exhausted" | "rate_limited" },
): Promise<SerpApiProviderState> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
  const cooldownMs = Math.max(1, growthSerpApiCooldownHoursOn429()) * 60 * 60 * 1000;
  const byCooldown = new Date(now.getTime() + cooldownMs);
  const kind = opts?.kind ?? "monthly_exhausted";
  let disabledUntil = byCooldown;
  if (kind === "monthly_exhausted") {
    const renewal = parseRenewalDate(s.account?.planRenewalDate ?? null, now);
    const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const target = renewal ?? firstOfNextMonth;
    disabledUntil = byCooldown > target ? byCooldown : target;
  }
  s.disabledUntilIso = disabledUntil.toISOString();
  s.last429AtIso = now.toISOString();
  s.reason = reason.slice(0, 300);
  await writeSerpApiProviderState(prisma, marketSlug, s);
  return s;
}

/** Clear circuit-breaker so the next discovery run may call SerpAPI again (caps still apply). */
export async function clearSerpApiCircuitBreaker(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
  note = "manual_clear",
): Promise<SerpApiProviderState> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
  s.disabledUntilIso = null;
  s.reason = note.slice(0, 300);
  await writeSerpApiProviderState(prisma, marketSlug, s);
  return s;
}

export type SerpApiAvailability = {
  enabled: boolean;
  reason?: string;
  state: SerpApiProviderState;
};

/** Pure helper — used by ops tests without consuming SerpAPI search quota. */
export function shouldAutoRecoverFromAccount(
  state: Pick<SerpApiProviderState, "disabledUntilIso" | "reason">,
  account: Pick<SerpApiAccountSnapshot, "planSearchesLeft"> | null,
  now: Date = new Date(),
): boolean {
  const left = account?.planSearchesLeft;
  if (typeof left !== "number" || left <= 0) return false;
  if (!state.disabledUntilIso) return false;
  const until = new Date(state.disabledUntilIso);
  if (Number.isNaN(until.getTime())) return true;
  // Recover whenever provider has searches again — even before disabledUntil clock.
  return true;
}

/**
 * Spread remaining MicStage monthly budget (and provider remaining) across days left in billing cycle.
 */
export function computeSerpDailyAllocation(input: {
  now: Date;
  callsMonth: number;
  monthlyBudget: number;
  planSearchesLeft: number | null;
  planRenewalDate: string | null;
  configuredDailyMax: number;
}): { dailyAllocation: number; daysRemaining: number; remainingBudget: number } {
  const monthlyBudget = Math.max(0, input.monthlyBudget);
  const micstageLeft = Math.max(0, monthlyBudget - Math.max(0, input.callsMonth));
  const providerLeft =
    typeof input.planSearchesLeft === "number" ? Math.max(0, input.planSearchesLeft) : micstageLeft;
  const remainingBudget = Math.min(micstageLeft, providerLeft);
  const renewal = parseRenewalDate(input.planRenewalDate, input.now);
  const end = renewal ?? new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 1));
  const msLeft = Math.max(0, end.getTime() - input.now.getTime());
  const daysRemaining = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  let dailyAllocation = Math.floor(remainingBudget / daysRemaining);
  if (remainingBudget > 0 && dailyAllocation < 1) dailyAllocation = 1;
  if (input.configuredDailyMax > 0) {
    dailyAllocation = Math.min(dailyAllocation, input.configuredDailyMax);
  }
  return { dailyAllocation, daysRemaining, remainingBudget };
}

export function parseRenewalDate(raw: string | null, now: Date): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const t = String(raw).trim();
  // YYYY-MM-DD → UTC midnight that day
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  // If renewal is in the past, ignore
  if (d.getTime() <= now.getTime()) return null;
  return d;
}

export async function probeSerpApiAccount(): Promise<SerpApiAccountSnapshot | null> {
  const apiKey = serpApiKeyForDiscovery();
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return null;
    const renewal =
      (typeof json.plan_renewal_date === "string" && json.plan_renewal_date) ||
      (typeof json.plan_next_renewal_date === "string" && json.plan_next_renewal_date) ||
      null;
    return {
      planId: typeof json.plan_id === "string" ? json.plan_id : null,
      planName: typeof json.plan_name === "string" ? json.plan_name : null,
      searchesPerMonth: typeof json.searches_per_month === "number" ? json.searches_per_month : null,
      planSearchesLeft: typeof json.plan_searches_left === "number" ? json.plan_searches_left : null,
      thisMonthUsage: typeof json.this_month_usage === "number" ? json.this_month_usage : null,
      totalSearchesLeft: typeof json.total_searches_left === "number" ? json.total_searches_left : null,
      planRenewalDate: renewal,
      probedAtIso: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function needsAccountProbe(state: SerpApiProviderState, now: Date): boolean {
  const last = state.account?.probedAtIso ? new Date(state.account.probedAtIso).getTime() : 0;
  const disabled =
    Boolean(state.disabledUntilIso) &&
    !Number.isNaN(new Date(state.disabledUntilIso!).getTime()) &&
    now < new Date(state.disabledUntilIso!);
  const minMs = disabled ? ACCOUNT_PROBE_MIN_MS_WHEN_DISABLED : ACCOUNT_PROBE_MIN_MS_WHEN_ENABLED;
  return now.getTime() - last >= minMs;
}

/**
 * Serp availability for a market. Caps only apply when the configured limit is **> 0**.
 *
 * Free-plan mode: Account API (no search cost) drives auto-recovery when quota resets and
 * spreads remaining MicStage monthly budget across days left until provider renewal.
 */
export async function serpApiAvailabilityNow(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
  opts?: { forAdapterRunStart?: boolean; forceAccountProbe?: boolean },
): Promise<SerpApiAvailability> {
  let s = await readSerpApiProviderState(prisma, marketSlug, now);
  let dirty = false;

  if (opts?.forceAccountProbe || needsAccountProbe(s, now)) {
    const account = await probeSerpApiAccount();
    if (account) {
      s.account = account;
      dirty = true;
      if (shouldAutoRecoverFromAccount(s, account, now)) {
        s.disabledUntilIso = null;
        s.reason = "auto_recovered_provider_quota_available";
      }
    }
  }

  const monthlyBudget = growthSerpApiMonthlySoftMax();
  const configuredDaily = growthSerpApiDailyMax();
  const alloc = computeSerpDailyAllocation({
    now,
    callsMonth: s.callsMonth,
    monthlyBudget,
    planSearchesLeft: s.account?.planSearchesLeft ?? null,
    planRenewalDate: s.account?.planRenewalDate ?? null,
    configuredDailyMax: configuredDaily > 0 ? configuredDaily : 999,
  });
  if (s.dailyAllocation !== alloc.dailyAllocation) {
    s.dailyAllocation = alloc.dailyAllocation;
    dirty = true;
  }
  if (dirty) {
    await writeSerpApiProviderState(prisma, marketSlug, s);
  }

  // Provider still at zero searches — stay paused (no search HTTP).
  if (typeof s.account?.planSearchesLeft === "number" && s.account.planSearchesLeft <= 0) {
    return { enabled: false, reason: "provider_quota_exhausted", state: s };
  }

  if (s.disabledUntilIso) {
    const until = new Date(s.disabledUntilIso);
    if (!Number.isNaN(until.getTime()) && now < until) {
      return {
        enabled: false,
        reason: `disabled_until:${until.toISOString()}`,
        state: s,
      };
    }
  }

  const effectiveDaily =
    configuredDaily > 0
      ? Math.min(configuredDaily, Math.max(0, alloc.dailyAllocation))
      : Math.max(0, alloc.dailyAllocation);
  if (effectiveDaily >= 0 && s.callsToday >= effectiveDaily) {
    // When allocation is 0, block every call (quota paused / budget spent for month).
    return { enabled: false, reason: effectiveDaily === 0 ? "daily_allocation_zero" : "daily_cap", state: s };
  }

  if (monthlyBudget > 0 && s.callsMonth >= monthlyBudget) {
    return { enabled: false, reason: "monthly_soft_cap", state: s };
  }
  const runsMax = growthSerpApiRunsPerDay();
  if (opts?.forAdapterRunStart && runsMax > 0 && s.runsToday >= runsMax) {
    return { enabled: false, reason: "run_frequency_cap", state: s };
  }
  return { enabled: true, state: s };
}
