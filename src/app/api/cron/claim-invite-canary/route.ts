import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  APPROVED_CLAIM_CANARY_SLUGS,
  sendApprovedClaimCanaryInvite,
} from "@/lib/publicListings/sendApprovedClaimCanary";
import {
  claimInviteDailyBudgetSnapshot,
  getClaimInvitePauseState,
} from "@/lib/publicListings/claimInviteAutomation";
import {
  effectiveListingClaimInvitesPerCron,
  micstageClaimInvitesEnabled,
} from "@/lib/publicListings/automationKillSwitches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

function presence(v: string | undefined): "present" | "missing" {
  return v?.trim() ? "present" : "missing";
}

function boolGate(v: string | undefined): "enabled" | "disabled" | "missing" {
  if (v === undefined || v === "") return "missing";
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return "enabled";
  if (["false", "0", "no", "off"].includes(s)) return "disabled";
  return "missing";
}

/**
 * GET — redacted Hostinger claim-invite env / gate status (auth required).
 * POST — send one allowlisted canary invite using production Resend.
 *
 * Body:
 * {
 *   "listingSlug": "...",
 *   "expectedDomain": "starrhill.com",
 *   "useGrowthLeadEmail": true,
 *   "confirm": "SEND_REAL_CANARY"
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

  const pause = await getClaimInvitePauseState(prisma);
  const daily = await claimInviteDailyBudgetSnapshot(prisma);

  return NextResponse.json({
    ok: true,
    env: {
      RESEND_API_KEY: presence(process.env.RESEND_API_KEY),
      EMAIL_FROM: presence(process.env.EMAIL_FROM),
      EMAIL_FROM_looks_micstage: process.env.EMAIL_FROM?.toLowerCase().includes("micstage")
        ? "valid"
        : process.env.EMAIL_FROM
          ? "invalid"
          : "missing",
      DATABASE_URL: presence(process.env.DATABASE_URL || process.env.DIRECT_URL),
      CRON_SECRET: presence(process.env.CRON_SECRET || process.env.MICSTAGE_CRON_SECRET),
      MICSTAGE_CLAIM_INVITES_ENABLED: boolGate(process.env.MICSTAGE_CLAIM_INVITES_ENABLED),
      MICSTAGE_CLAIM_INVITES_CANARY_MODE: boolGate(process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE),
      LISTING_CLAIM_INVITES_PER_CRON: process.env.LISTING_CLAIM_INVITES_PER_CRON?.trim() || "missing",
      MICSTAGE_CLAIM_INVITES_DAILY_MAX: process.env.MICSTAGE_CLAIM_INVITES_DAILY_MAX?.trim() || "missing",
      MICSTAGE_RESEND_DAILY_MAX: process.env.MICSTAGE_RESEND_DAILY_MAX?.trim() || "missing",
      MICSTAGE_KILL_CLAIM_INVITES: boolGate(process.env.MICSTAGE_KILL_CLAIM_INVITES),
      GROWTH_AUTO_DRAFT_CRON_ENABLED: boolGate(process.env.GROWTH_AUTO_DRAFT_CRON_ENABLED),
      NODE_ENV: process.env.NODE_ENV === "development" ? "invalid" : process.env.NODE_ENV ? "valid" : "missing",
    },
    derived: {
      claimInvitesEnabled: micstageClaimInvitesEnabled() ? "enabled" : "disabled",
      effectivePerCron: effectiveListingClaimInvitesPerCron(),
      dailyClaimInviteMax: daily.max,
      dailyClaimInviteSent: daily.sentTodayUtc,
      dailyClaimInviteRemaining: daily.remaining,
      paused: pause.paused,
      pauseReason: pause.reason,
    },
    allowlist: Object.keys(APPROVED_CLAIM_CANARY_SLUGS),
  });
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await consumeRateLimit({
    scope: "cron:claim-invite-canary",
    identifier: "global",
    limit: 6,
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
    listingSlug?: string;
    expectedDomain?: string;
    expectedRecipient?: string;
    useGrowthLeadEmail?: boolean;
    confirm?: string;
    verifyClaimPage?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const listingSlug = body.listingSlug?.trim();
  const expectedDomain = body.expectedDomain?.trim();
  if (!listingSlug || !expectedDomain || !body.confirm) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["listingSlug", "expectedDomain", "confirm"] },
      { status: 400 },
    );
  }

  // Keep automation cron disabled during explicit canary; this endpoint does not flip env.
  const result = await sendApprovedClaimCanaryInvite(prisma, {
    listingSlug,
    expectedDomain,
    expectedRecipient: body.expectedRecipient,
    useGrowthLeadEmail: body.useGrowthLeadEmail !== false,
    confirm: body.confirm,
    verifyClaimPage: body.verifyClaimPage !== false,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }

  // Isolation checks
  const chooseTokens = await prisma.listingClaimInviteToken.count({
    where: { listing: { slug: "monday-night-poetry-open-mic-hosted-by-keeping-it-p" } },
  });
  const bookclubTokens = await prisma.listingClaimInviteToken.count({
    where: { listing: { slug: { contains: "bookclub" } } },
  });

  return NextResponse.json({
    ...result,
    isolation: {
      choose901Tokens:
        listingSlug === "monday-night-poetry-open-mic-hosted-by-keeping-it-p" ? chooseTokens : chooseTokens,
      bookclubTokens,
      automationStillOffUnlessHostingerEnvEnabled: !micstageClaimInvitesEnabled(),
      effectivePerCron: effectiveListingClaimInvitesPerCron(),
    },
  });
}
