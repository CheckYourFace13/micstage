import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { nationalDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";
import { serpApiKeyForDiscovery } from "@/lib/growth/discovery/autonomousConfig";
import {
  clearSerpApiCircuitBreaker,
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
 * Read-only SerpAPI account + MicStage circuit state (no API key in response).
 * POST ?action=clear_circuit&confirm=1 — clear stale disabledUntil (caps unchanged).
 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await buildStatus());
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
      account: await probeAccount(),
    });
  }
  return NextResponse.json(await buildStatus());
}

async function buildStatus() {
  const prisma = getPrismaOrNull();
  const market = nationalDiscoveryMarketSlug();
  const account = await probeAccount();
  if (!prisma) {
    return { ok: false, error: "database_unavailable", account };
  }
  const state = await readSerpApiProviderState(prisma, market);
  const avail = await serpApiAvailabilityNow(prisma, market);
  return {
    ok: true,
    now: new Date().toISOString(),
    market,
    keyPresent: Boolean(serpApiKeyForDiscovery()),
    availability: { enabled: avail.enabled, reason: avail.reason ?? null },
    circuit: {
      disabledUntilIso: state.disabledUntilIso,
      reason: state.reason,
      last429AtIso: state.last429AtIso,
      callsToday: state.callsToday,
      callsMonth: state.callsMonth,
      runsToday: state.runsToday,
      dayKey: state.dayKey,
      monthKey: state.monthKey,
    },
    account,
    diagnosisHint: diagnose(state, account, avail.enabled),
  };
}

async function probeAccount(): Promise<Record<string, unknown> | null> {
  const apiKey = serpApiKeyForDiscovery();
  if (!apiKey) return { error: "no_key_on_server" };
  try {
    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { httpStatus: res.status, parseError: true, bodyPreview: text.slice(0, 200) };
    }
    if (!res.ok) {
      return {
        httpStatus: res.status,
        error: typeof json.error === "string" ? json.error : text.slice(0, 200),
      };
    }
    return {
      httpStatus: res.status,
      account_email: typeof json.account_email === "string" ? redactEmail(json.account_email) : null,
      plan_id: json.plan_id ?? null,
      plan_name: json.plan_name ?? null,
      searches_per_month: json.searches_per_month ?? null,
      plan_searches_left: json.plan_searches_left ?? null,
      this_month_usage: json.this_month_usage ?? null,
      total_searches_left: json.total_searches_left ?? null,
      this_hour_searches: json.this_hour_searches ?? null,
      last_hour_searches: json.last_hour_searches ?? null,
      account_rate_limit_per_hour: json.account_rate_limit_per_hour ?? null,
      extra_credits: json.extra_credits ?? null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email.slice(at + 1, at + 3)}***`;
}

function diagnose(
  state: { disabledUntilIso: string | null; reason: string | null; last429AtIso: string | null },
  account: Record<string, unknown> | null,
  availEnabled: boolean,
): string {
  const left = typeof account?.plan_searches_left === "number" ? account.plan_searches_left : null;
  const until = state.disabledUntilIso ? new Date(state.disabledUntilIso) : null;
  const locked = until && !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
  if (locked && left !== null && left > 0) {
    return "micstage_circuit_stale_provider_has_searches";
  }
  if (locked && left === 0) {
    return "provider_plan_quota_exhausted_and_micstage_circuit_open";
  }
  if (!availEnabled && left === 0) {
    return "provider_plan_quota_exhausted";
  }
  if (availEnabled && left !== null && left > 0) {
    return "healthy";
  }
  if (locked) {
    return "micstage_circuit_open_account_unknown_or_error";
  }
  return "see_availability_and_account";
}
