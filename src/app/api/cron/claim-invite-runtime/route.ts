import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  OPERATIONAL_RUNTIME_KEYS,
  isOperationalRuntimeKey,
  resolveClaimInviteRuntimeSnapshot,
  runtimeSnapshotForStatus,
  upsertClaimInviteRuntimeSetting,
  type OperationalRuntimeKey,
} from "@/lib/publicListings/claimInviteRuntimeSettings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONFIRM = "UPDATE_CLAIM_INVITE_RUNTIME";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

/**
 * GET — read claim-invite runtime settings (env + DB + effective). Auth required. No secrets.
 * POST — upsert allowlisted operational keys. Requires confirm + CRON_SECRET.
 *
 * Body:
 * {
 *   "confirm": "UPDATE_CLAIM_INVITE_RUNTIME",
 *   "settings": {
 *     "MICSTAGE_CLAIM_INVITES_ENABLED": true,
 *     "LISTING_CLAIM_INVITES_PER_CRON": 2,
 *     "MICSTAGE_CLAIM_INVITES_DAILY_MAX": 10,
 *     "MICSTAGE_KILL_CLAIM_INVITES": false,
 *     "GROWTH_OUTREACH_SENDS_PER_CRON_RUN": 0
 *   },
 *   "reason": "optional"
 * }
 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const snap = await resolveClaimInviteRuntimeSnapshot(prisma);
  return NextResponse.json({
    ok: true,
    allowlist: [...OPERATIONAL_RUNTIME_KEYS],
    runtime: runtimeSnapshotForStatus(snap),
  });
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.NODE_ENV === "development") {
    // Still allow in development for local testing, but never without auth above.
  }

  const rl = await consumeRateLimit({
    scope: "cron:claim-invite-runtime",
    identifier: "global",
    limit: 20,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  let body: {
    confirm?: string;
    settings?: Record<string, unknown>;
    reason?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM) {
    return NextResponse.json(
      { ok: false, error: "confirmation_required", required: CONFIRM },
      { status: 400 },
    );
  }

  const settings = body.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return NextResponse.json({ ok: false, error: "settings_object_required" }, { status: 400 });
  }

  const keys = Object.keys(settings);
  if (keys.length === 0) {
    return NextResponse.json({ ok: false, error: "empty_settings" }, { status: 400 });
  }

  const results: Array<{ key: string; ok: boolean; value?: string; error?: string }> = [];
  for (const key of keys) {
    if (!isOperationalRuntimeKey(key)) {
      results.push({ key, ok: false, error: "key_not_allowlisted" });
      continue;
    }
    const upserted = await upsertClaimInviteRuntimeSetting(prisma, {
      key: key as OperationalRuntimeKey,
      value: settings[key],
      updatedBy: "claim-invite-runtime-api",
      reason: body.reason?.trim() || "runtime_settings_update",
      meta: { via: "POST /api/cron/claim-invite-runtime" },
    });
    if (!upserted.ok) {
      results.push({ key, ok: false, error: upserted.error });
    } else {
      results.push({ key, ok: true, value: upserted.value });
    }
  }

  if (results.some((r) => !r.ok)) {
    return NextResponse.json({ ok: false, error: "partial_or_full_failure", results }, { status: 422 });
  }

  const snap = await resolveClaimInviteRuntimeSnapshot(prisma);
  return NextResponse.json({
    ok: true,
    updated: results,
    runtime: runtimeSnapshotForStatus(snap),
  });
}
