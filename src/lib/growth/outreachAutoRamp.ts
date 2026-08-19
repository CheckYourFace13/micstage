/**
 * Automatic outreach volume ramp: 25 → 50 → ~60 (provider headroom minus transactional reserve).
 * Never exceeds configured architecture ceiling of 60 without a later runtime change.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { evaluateOutreachSendHealth } from "@/lib/growth/outreachHealthThrottle";
import { micstageTransactionalReserveSlots } from "@/lib/growth/outreachRuntimeSettings";
import { micstageResendDailyMax } from "@/lib/resendDailyBudget";
import {
  clampOutreachDailyMaxForRlsGate,
  DATABASE_RLS_SECURITY_OUTREACH_CAP,
  isDatabaseRlsSecurityGateClear,
} from "@/lib/database/databaseRlsSecurity";

export const OUTREACH_AUTORAMP_KEY = "GROWTH_OUTREACH_AUTORAMP_STATE";
export const OUTREACH_AUTORAMP_STAGES = [25, 50, 60] as const;
export const OUTREACH_AUTORAMP_WINDOW_MS = 48 * 60 * 60 * 1000;
export const OUTREACH_AUTORAMP_MIN_SENDS = 20;
export const OUTREACH_AUTORAMP_ARCH_CEILING = 60;

export type OutreachAutoRampState = {
  stage: number;
  stageEnteredAt: string;
  lastEvalAt: string | null;
  lastReason: string | null;
};

export type OutreachAutoRampDecision = {
  ramp: boolean;
  nextDailyMax: number;
  reason: string;
};

export function providerMarketingCeiling(providerMax = micstageResendDailyMax(), reserve = micstageTransactionalReserveSlots()): number {
  return Math.max(0, providerMax - reserve);
}

export function evaluateOutreachAutoRamp(input: {
  currentDailyMax: number;
  stageEnteredAt: Date;
  now: Date;
  sentInWindow: number;
  complaints: number;
  hardBounceRate: number;
  bounceStopRate: number;
  healthOk: boolean;
  targetingOk: boolean;
  earlyComplaintThrottle: boolean;
  securityGateClear: boolean;
}): OutreachAutoRampDecision {
  const ceiling = Math.min(OUTREACH_AUTORAMP_ARCH_CEILING, providerMarketingCeiling());
  const current = Math.min(input.currentDailyMax, ceiling);
  if (!input.securityGateClear) {
    return {
      ramp: false,
      nextDailyMax: Math.min(current, DATABASE_RLS_SECURITY_OUTREACH_CAP),
      reason: "hold_rls_security_gate",
    };
  }
  if (input.earlyComplaintThrottle || !input.healthOk || !input.targetingOk || input.complaints > 0) {
    return { ramp: false, nextDailyMax: current, reason: "hold_unhealthy" };
  }
  if (input.hardBounceRate >= input.bounceStopRate) {
    return { ramp: false, nextDailyMax: current, reason: "hold_bounce_rate" };
  }
  const elapsed = input.now.getTime() - input.stageEnteredAt.getTime();
  if (elapsed < OUTREACH_AUTORAMP_WINDOW_MS) {
    return { ramp: false, nextDailyMax: current, reason: "hold_window_not_elapsed" };
  }
  if (input.sentInWindow < OUTREACH_AUTORAMP_MIN_SENDS) {
    return { ramp: false, nextDailyMax: current, reason: "hold_insufficient_sends" };
  }
  const nextStage = OUTREACH_AUTORAMP_STAGES.find((s) => s > current);
  if (nextStage == null) {
    return { ramp: false, nextDailyMax: current, reason: "at_ceiling" };
  }
  const nextDailyMax = Math.min(nextStage, ceiling);
  if (nextDailyMax <= current) {
    return { ramp: false, nextDailyMax: current, reason: "provider_headroom_caps_ramp" };
  }
  return { ramp: true, nextDailyMax, reason: `ramp_${current}_to_${nextDailyMax}` };
}

function parseRampState(raw: string | null | undefined): OutreachAutoRampState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<OutreachAutoRampState>;
    if (typeof p.stage !== "number" || typeof p.stageEnteredAt !== "string") return null;
    return {
      stage: p.stage,
      stageEnteredAt: p.stageEnteredAt,
      lastEvalAt: typeof p.lastEvalAt === "string" ? p.lastEvalAt : null,
      lastReason: typeof p.lastReason === "string" ? p.lastReason : null,
    };
  } catch {
    return null;
  }
}

export async function applyOutreachAutoRamp(prisma: PrismaClient, now = new Date()): Promise<OutreachAutoRampDecision> {
  const setting = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: "GROWTH_OUTREACH_DAILY_MAX" },
    select: { value: true },
  });
  const currentDailyMax = Number.parseInt(setting?.value || "25", 10) || 25;

  const stored = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: OUTREACH_AUTORAMP_KEY },
    select: { value: true },
  });
  let rampState = parseRampState(stored?.value);
  if (!rampState) {
    const first = await prisma.marketingEmailSend.findFirst({
      where: { category: "OUTREACH", status: "SENT" },
      orderBy: { sentAt: "asc" },
      select: { sentAt: true },
    });
    rampState = {
      stage: currentDailyMax,
      stageEnteredAt: (first?.sentAt ?? now).toISOString(),
      lastEvalAt: null,
      lastReason: null,
    };
  }

  const since = new Date(rampState.stageEnteredAt);
  const [sentInWindow, complaints, health, securityGateClear] = await Promise.all([
    prisma.marketingEmailSend.count({
      where: { category: "OUTREACH", status: "SENT", sentAt: { gte: since } },
    }),
    prisma.marketingEmailSend.count({
      where: { category: "OUTREACH", complainedAt: { gte: since } },
    }),
    evaluateOutreachSendHealth(prisma),
    isDatabaseRlsSecurityGateClear(prisma),
  ]);
  const bounceStopRate = Number.parseFloat(process.env.GROWTH_OUTREACH_HEALTH_HARD_BOUNCE_STOP_RATE?.trim() || "0.05");
  const targeting = health.ok && health.sendMultiplier > 0;
  let decision = evaluateOutreachAutoRamp({
    currentDailyMax,
    stageEnteredAt: new Date(rampState.stageEnteredAt),
    now,
    sentInWindow,
    complaints,
    hardBounceRate: health.hardBounceRate,
    bounceStopRate,
    healthOk: health.ok && health.sendMultiplier >= 1,
    targetingOk: targeting,
    earlyComplaintThrottle: Boolean(health.reason?.startsWith("early_complaint")),
    securityGateClear,
  });

  const gatedDailyMax = clampOutreachDailyMaxForRlsGate(decision.nextDailyMax, securityGateClear);
  if (gatedDailyMax !== decision.nextDailyMax) {
    decision = { ramp: false, nextDailyMax: gatedDailyMax, reason: "hold_rls_security_gate" };
  }

  const nextState: OutreachAutoRampState = {
    stage: decision.nextDailyMax,
    stageEnteredAt: decision.ramp ? now.toISOString() : rampState.stageEnteredAt,
    lastEvalAt: now.toISOString(),
    lastReason: decision.reason,
  };
  await prisma.operationalRuntimeSetting.upsert({
    where: { key: OUTREACH_AUTORAMP_KEY },
    create: {
      key: OUTREACH_AUTORAMP_KEY,
      valueType: "json",
      value: JSON.stringify(nextState),
      updatedBy: "outreach-auto-ramp",
      reason: decision.reason,
    },
    update: {
      valueType: "json",
      value: JSON.stringify(nextState),
      updatedBy: "outreach-auto-ramp",
      reason: decision.reason,
    },
  });

  if (decision.ramp) {
    await prisma.operationalRuntimeSetting.upsert({
      where: { key: "GROWTH_OUTREACH_DAILY_MAX" },
      create: {
        key: "GROWTH_OUTREACH_DAILY_MAX",
        valueType: "integer",
        value: String(decision.nextDailyMax),
        updatedBy: "outreach-auto-ramp",
        reason: decision.reason,
      },
      update: {
        valueType: "integer",
        value: String(decision.nextDailyMax),
        updatedBy: "outreach-auto-ramp",
        reason: decision.reason,
      },
    });
  }

  return decision;
}

export function nextRampConditionLabel(input: {
  currentDailyMax: number;
  lastReason: string | null;
}): string {
  if (input.currentDailyMax >= OUTREACH_AUTORAMP_ARCH_CEILING) {
    return `at architecture ceiling ${OUTREACH_AUTORAMP_ARCH_CEILING}/day`;
  }
  const next = OUTREACH_AUTORAMP_STAGES.find((s) => s > input.currentDailyMax) ?? OUTREACH_AUTORAMP_ARCH_CEILING;
  return `auto-raise to ${next}/day after 48h + ${OUTREACH_AUTORAMP_MIN_SENDS} healthy sends (no complaints, bounce below stop threshold)`;
}

export async function outreachAutoRampStatus(prisma: PrismaClient): Promise<{
  lastReason: string | null;
  nextCondition: string;
  providerCeiling: number;
}> {
  const stored = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: OUTREACH_AUTORAMP_KEY },
    select: { value: true },
  });
  const parsed = parseRampState(stored?.value);
  const capRow = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: "GROWTH_OUTREACH_DAILY_MAX" },
    select: { value: true },
  });
  const currentDailyMax = Number.parseInt(capRow?.value || "25", 10) || 25;
  return {
    lastReason: parsed?.lastReason ?? null,
    nextCondition: nextRampConditionLabel({ currentDailyMax, lastReason: parsed?.lastReason ?? null }),
    providerCeiling: providerMarketingCeiling(),
  };
}
