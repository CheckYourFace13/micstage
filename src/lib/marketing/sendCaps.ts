import type { PrismaClient } from "@/generated/prisma/client";
import type { MarketingEmailCategory } from "@/generated/prisma/client";
import {
  marketingContactCooldownHours,
  marketingDailyCap,
  marketingPerDomainDailyCap,
  marketingSequenceDelayMinutes,
  micStageCategoryFromPrisma,
} from "@/lib/marketing/emailConfig";
import { growthOutreachDailyMax, growthOutreachDailyTarget } from "@/lib/growth/expansionConfig";

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export async function countSendsToday(
  prisma: PrismaClient,
  category: MarketingEmailCategory,
  since: Date,
): Promise<number> {
  return prisma.marketingEmailSend.count({
    where: {
      category,
      status: "SENT",
      sentAt: { gte: since },
    },
  });
}

export async function countSendsTodayToDomain(
  prisma: PrismaClient,
  category: MarketingEmailCategory,
  domain: string,
  since: Date,
): Promise<number> {
  return prisma.marketingEmailSend.count({
    where: {
      category,
      status: "SENT",
      sentAt: { gte: since },
      toDomain: domain.toLowerCase(),
    },
  });
}

export type CapViolation = { ok: false; reason: string } | { ok: true };

export async function checkCategoryAndDomainCaps(
  prisma: PrismaClient,
  category: MarketingEmailCategory,
  toDomain: string,
): Promise<CapViolation> {
  const since = startOfUtcDay();
  const mic = micStageCategoryFromPrisma(category);
  const daily = marketingDailyCap(mic);
  const catCount = await countSendsToday(prisma, category, since);
  if (catCount >= daily) {
    return { ok: false, reason: `Daily cap reached for category ${category} (${daily})` };
  }
  if (mic !== "transactional") {
    const domCap = marketingPerDomainDailyCap(category);
    const domCount = await countSendsTodayToDomain(prisma, category, toDomain, since);
    if (domCount >= domCap) {
      return { ok: false, reason: `Per-domain daily cap reached for ${toDomain} (${domCap}, ${category})` };
    }
  }
  return { ok: true };
}

/** Same contact + category family cooldown for duplicate purpose (handled via idempotency key separately). */
export async function checkContactSendSpacing(
  prisma: PrismaClient,
  contactId: string,
  category: MarketingEmailCategory,
): Promise<CapViolation> {
  if (category === "TRANSACTIONAL") return { ok: true };
  const delayMin = marketingSequenceDelayMinutes();
  const cutoff = new Date(Date.now() - delayMin * 60 * 1000);
  const recent = await prisma.marketingEmailSend.findFirst({
    where: {
      contactId,
      category: { in: ["OUTREACH", "MARKETING"] },
      status: "SENT",
      sentAt: { gte: cutoff },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (recent?.sentAt) {
    return {
      ok: false,
      reason: `Per-contact send spacing: last outreach/marketing send ${recent.sentAt.toISOString()} (min ${delayMin} min)`,
    };
  }

  const coolH = marketingContactCooldownHours();
  const coolCut = new Date(Date.now() - coolH * 60 * 60 * 1000);
  const recentCool = await prisma.marketingEmailSend.findFirst({
    where: {
      contactId,
      category,
      status: "SENT",
      sentAt: { gte: coolCut },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true, templateKind: true },
  });
  if (recentCool?.sentAt) {
    return {
      ok: false,
      reason: `Contact cooldown (${coolH}h) for category ${category} since ${recentCool.sentAt.toISOString()}`,
    };
  }
  return { ok: true };
}

/** Cap / spacing only — must stay retryable (no permanent MarketingEmailSend BLOCKED for these). */
export function isTransientMarketingThrottleReason(reason: string): boolean {
  const r = reason.trim();
  return (
    r.startsWith("Daily cap reached for category") ||
    r.startsWith("Per-domain daily cap reached for") ||
    r.startsWith("Per-contact send spacing:") ||
    r.startsWith("Contact cooldown (")
  );
}

export function isOnlyTransientMarketingThrottle(reasons: string[]): boolean {
  return reasons.length > 0 && reasons.every((x) => isTransientMarketingThrottleReason(x));
}

/** True when the global category daily cap is exhausted (no point trying more recipients this UTC day). */
export function reasonsIncludeGlobalCategoryDailyCap(reasons: string[]): boolean {
  return reasons.some((r) => r.trim().startsWith("Daily cap reached for category"));
}

/** Remaining OUTREACH sends allowed today (UTC day) before hitting MARKETING_CAP_DAILY_OUTREACH. */
export async function remainingOutreachDailySends(prisma: PrismaClient): Promise<number> {
  const since = startOfUtcDay();
  const daily = marketingDailyCap("outreach");
  const catCount = await countSendsToday(prisma, "OUTREACH", since);
  return Math.max(0, daily - catCount);
}

/**
 * Daily budget for growth-pipeline outreach automation: min(marketing outreach cap, GROWTH_OUTREACH_DAILY_MAX).
 * Use this (not {@link remainingOutreachDailySends} alone) so growth can respect a 50/day ceiling while global
 * marketing env may still cap lower.
 */
export async function remainingGrowthOutreachAutomationBudget(prisma: PrismaClient): Promise<{
  sentTodayUtc: number;
  marketingOutreachCap: number;
  growthDailyMax: number;
  effectiveDailyMax: number;
  dailyTarget: number;
  remainingToEffectiveMax: number;
}> {
  const since = startOfUtcDay();
  const sentTodayUtc = await countSendsToday(prisma, "OUTREACH", since);
  const marketingOutreachCap = marketingDailyCap("outreach");
  const growthDailyMax = growthOutreachDailyMax();
  const effectiveDailyMax = Math.min(marketingOutreachCap, growthDailyMax);
  const dailyTarget = growthOutreachDailyTarget();
  return {
    sentTodayUtc,
    marketingOutreachCap,
    growthDailyMax,
    effectiveDailyMax,
    dailyTarget,
    remainingToEffectiveMax: Math.max(0, effectiveDailyMax - sentTodayUtc),
  };
}
