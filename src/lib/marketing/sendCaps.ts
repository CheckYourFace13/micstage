import type { PrismaClient } from "@/generated/prisma/client";
import type { MarketingEmailCategory } from "@/generated/prisma/client";
import {
  marketingContactCooldownHours,
  marketingDailyCap,
  marketingPerDomainDailyCap,
  marketingSequenceDelayMinutes,
  micStageCategoryFromPrisma,
} from "@/lib/marketing/emailConfig";

function startOfUtcDay(d = new Date()): Date {
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
    const domCap = marketingPerDomainDailyCap();
    const domCount = await countSendsTodayToDomain(prisma, category, toDomain, since);
    if (domCount >= domCap) {
      return { ok: false, reason: `Per-domain daily cap reached for ${toDomain} (${domCap})` };
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
