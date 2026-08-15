import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { nationalDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";
import {
  growthSerpApiDailyMax,
  growthSerpApiMonthlySoftMax,
  serpApiKeyForDiscovery,
} from "@/lib/growth/discovery/autonomousConfig";
import {
  clearSerpApiCircuitBreaker,
  computeSerpDailyAllocation,
  probeSerpApiAccount,
  readSerpApiProviderState,
  serpApiAvailabilityNow,
} from "@/lib/growth/discovery/providerState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

/**
 * Read-only SerpAPI account + MicStage circuit / free-plan allocation (no API key in response).
 * Uses Account API (does not consume search quota).
 * POST ?action=clear_circuit&confirm=1 — emergency manual clear only (prefer auto-recovery).
 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await buildStatus(true));
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get("action")?.trim();
  const confirm = url.searchParams.get("confirm")?.trim();
  if (action === "clear_circuit" && confirm === "1") {
    const prisma = getPrismaOrNull();
    if (!prisma) {
      return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
    }
    const market = nationalDiscoveryMarketSlug();
    const before = await readSerpApiProviderState(prisma, market);
    const after = await clearSerpApiCircuitBreaker(prisma, market, new Date(), "ops_clear_stale_circuit");
    return NextResponse.json({
      ok: true,
      action: "clear_circuit",
      market,
      note: "Prefer automatic Account-API recovery after quota reset; manual clear is emergency-only.",
      before: {
        disabledUntilIso: before.disabledUntilIso,
        reason: before.reason,
        last429AtIso: before.last429AtIso,
        callsMonth: before.callsMonth,
      },
      after: {
        disabledUntilIso: after.disabledUntilIso,
        reason: after.reason,
        last429AtIso: after.last429AtIso,
        callsMonth: after.callsMonth,
      },
      account: await probeSerpApiAccount(),
    });
  }
  return NextResponse.json(await buildStatus(true));
}

async function buildStatus(forceProbe: boolean) {
  const prisma = getPrismaOrNull();
  const market = nationalDiscoveryMarketSlug();
  if (!prisma) {
    const account = await probeSerpApiAccount();
    return { ok: false, error: "database_unavailable", account };
  }
  const avail = await serpApiAvailabilityNow(prisma, market, new Date(), {
    forceAccountProbe: forceProbe,
  });
  const state = avail.state;
  const account = state.account;
  const monthlyBudget = growthSerpApiMonthlySoftMax();
  const alloc = computeSerpDailyAllocation({
    now: new Date(),
    callsMonth: state.callsMonth,
    monthlyBudget,
    planSearchesLeft: account?.planSearchesLeft ?? null,
    planRenewalDate: account?.planRenewalDate ?? null,
    configuredDailyMax: growthSerpApiDailyMax() > 0 ? growthSerpApiDailyMax() : 999,
  });
  return {
    ok: true,
    now: new Date().toISOString(),
    market,
    keyPresent: Boolean(serpApiKeyForDiscovery()),
    availability: { enabled: avail.enabled, reason: avail.reason ?? null },
    freePlanBudget: {
      monthlySoftMax: monthlyBudget,
      configuredDailyMax: growthSerpApiDailyMax(),
      dailyAllocation: alloc.dailyAllocation,
      daysRemaining: alloc.daysRemaining,
      remainingBudget: alloc.remainingBudget,
      micstageCallsMonth: state.callsMonth,
    },
    circuit: {
      disabledUntilIso: state.disabledUntilIso,
      reason: state.reason,
      last429AtIso: state.last429AtIso,
      callsToday: state.callsToday,
      callsMonth: state.callsMonth,
      runsToday: state.runsToday,
      dayKey: state.dayKey,
      monthKey: state.monthKey,
      dailyAllocation: state.dailyAllocation,
    },
    account: account
      ? {
          plan_id: account.planId,
          plan_name: account.planName,
          searches_per_month: account.searchesPerMonth,
          plan_searches_left: account.planSearchesLeft,
          this_month_usage: account.thisMonthUsage,
          total_searches_left: account.totalSearchesLeft,
          plan_renewal_date: account.planRenewalDate,
          probed_at: account.probedAtIso,
        }
      : null,
    diagnosisHint: diagnose(state, account, avail.enabled),
    policy:
      "SerpAPI is optional growth. Exhausted Free quota pauses discovery searches only; product + backlog pipelines continue. Auto-recovers via Account API when plan_searches_left > 0.",
  };
}

function diagnose(
  state: { disabledUntilIso: string | null; reason: string | null },
  account: { planSearchesLeft: number | null } | null,
  availEnabled: boolean,
): string {
  const left = account?.planSearchesLeft ?? null;
  const until = state.disabledUntilIso ? new Date(state.disabledUntilIso) : null;
  const locked = until && !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
  if (left === 0) return "discovery_paused_provider_quota_exhausted_auto_resume_on_reset";
  if (locked && left !== null && left > 0) return "should_auto_recover_on_next_probe";
  if (availEnabled && left !== null && left > 0) return "healthy";
  if (locked) return "circuit_open_waiting_provider_reset_or_probe";
  return "see_availability_and_account";
}
