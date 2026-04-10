import type { PrismaClient } from "@/generated/prisma/client";
import {
  growthSerpApiCooldownHoursOn429,
  growthSerpApiDailyMax,
  growthSerpApiMonthlySoftMax,
  growthSerpApiRunsPerDay,
} from "@/lib/growth/discovery/autonomousConfig";
import {
  readDiscoveryCursorJson,
  writeDiscoveryCursorJson,
} from "@/lib/growth/discovery/discoveryCursor";

const PROVIDER_ADAPTER_ID = "__provider__";
const SERP_STATE_KEY = "serpapi_state";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

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
  };
}

function normalizedState(state: SerpApiProviderState | null, now: Date): SerpApiProviderState {
  const out = state ?? freshState(now);
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

export async function disableSerpApiOnQuota429(
  prisma: PrismaClient,
  marketSlug: string,
  reason: string,
  now: Date = new Date(),
): Promise<SerpApiProviderState> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
  const cooldownMs = Math.max(1, growthSerpApiCooldownHoursOn429()) * 60 * 60 * 1000;
  const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const byCooldown = new Date(now.getTime() + cooldownMs);
  const disabledUntil = byCooldown > firstOfNextMonth ? byCooldown : firstOfNextMonth;
  s.disabledUntilIso = disabledUntil.toISOString();
  s.last429AtIso = now.toISOString();
  s.reason = reason.slice(0, 300);
  await writeSerpApiProviderState(prisma, marketSlug, s);
  return s;
}

export type SerpApiAvailability = {
  enabled: boolean;
  reason?: string;
  state: SerpApiProviderState;
};

/**
 * Serp availability for a market. Caps only apply when the configured limit is **> 0**.
 *
 * If `GROWTH_SERPAPI_DAILY_MAX=0` (or monthly / runs-per-day = 0), treating `callsToday >= 0` as "over cap" would
 * block **every** request forever with `serpapi_calls_today` stuck at 0 and `reason` unset — a silent production skip.
 *
 * `runsPerDay` gates **adapter run starts** only (`discoverySearchProviderForMarket`). Individual HTTP calls use
 * `markSerpApiCall` + daily/monthly caps above; we do **not** re-check `runsToday` inside `runSerpApiSearch` so
 * `markSerpApiRunStarted` cannot block the first request in the same run.
 */
export async function serpApiAvailabilityNow(
  prisma: PrismaClient,
  marketSlug: string,
  now: Date = new Date(),
  opts?: { forAdapterRunStart?: boolean },
): Promise<SerpApiAvailability> {
  const s = await readSerpApiProviderState(prisma, marketSlug, now);
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
  const dailyMax = growthSerpApiDailyMax();
  if (dailyMax > 0 && s.callsToday >= dailyMax) {
    return { enabled: false, reason: "daily_cap", state: s };
  }
  const monthMax = growthSerpApiMonthlySoftMax();
  if (monthMax > 0 && s.callsMonth >= monthMax) {
    return { enabled: false, reason: "monthly_soft_cap", state: s };
  }
  const runsMax = growthSerpApiRunsPerDay();
  if (opts?.forAdapterRunStart && runsMax > 0 && s.runsToday >= runsMax) {
    return { enabled: false, reason: "run_frequency_cap", state: s };
  }
  return { enabled: true, state: s };
}
