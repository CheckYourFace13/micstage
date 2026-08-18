import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";
import { countEligiblePendingListingClaimInvites } from "@/lib/publicListings/claimInvitePendingCount";
import { resolveClaimInviteRuntimeSnapshot } from "@/lib/publicListings/claimInviteRuntimeSettings";
import { micstageTransactionalReserveSlots } from "@/lib/growth/outreachRuntimeSettings";

/** Resend free tier is 100/day — stay under with headroom for password resets & booking reminders. */
export function micstageResendDailyMax(): number {
  return parseIntEnv("MICSTAGE_RESEND_DAILY_MAX", 95);
}

/** Staged claim invites: async — honors DB runtime settings + env kill. */
export async function listingClaimInvitesPerCron(prisma: PrismaClient): Promise<number> {
  const snap = await resolveClaimInviteRuntimeSnapshot(prisma);
  return snap.effectivePerCron;
}

/** Counts pipeline sends + claim invites (direct Resend, not in MarketingEmailSend). */
export async function countMicstageResendSendsTodayUtc(prisma: PrismaClient): Promise<number> {
  const since = startOfUtcDay();
  const [pipeline, claimInvites] = await Promise.all([
    prisma.marketingEmailSend.count({
      where: { status: "SENT", sentAt: { gte: since } },
    }),
    prisma.publicOpenMicListing.count({
      where: { claimInviteEmailSentAt: { gte: since } },
    }),
  ]);
  return pipeline + claimInvites;
}

export async function countOutreachSendsTodayUtc(prisma: PrismaClient): Promise<number> {
  return prisma.marketingEmailSend.count({
    where: { category: "OUTREACH", status: "SENT", sentAt: { gte: startOfUtcDay() } },
  });
}

/** Shared Resend account capacity with transactional reserve for marketing outreach only. */
export async function marketingOutreachCapacitySnapshot(
  prisma: PrismaClient,
  configuredDailyMax: number,
): Promise<{
  providerMax: number;
  sentTodayUtc: number;
  transactionalReserve: number;
  slotsAfterReserve: number;
  configuredDailyMax: number;
  outreachSentToday: number;
  effectiveMarketingMax: number;
  remainingForOutreach: number;
}> {
  const providerMax = micstageResendDailyMax();
  const sentTodayUtc = await countMicstageResendSendsTodayUtc(prisma);
  const transactionalReserve = micstageTransactionalReserveSlots();
  const outreachSentToday = await countOutreachSendsTodayUtc(prisma);
  const slotsLeft = Math.max(0, providerMax - sentTodayUtc);
  const slotsAfterReserve = Math.max(0, slotsLeft - transactionalReserve);
  const effectiveMarketingMax = Math.min(configuredDailyMax, slotsAfterReserve);
  const remainingForOutreach = Math.max(0, effectiveMarketingMax - outreachSentToday);
  return {
    providerMax,
    sentTodayUtc,
    transactionalReserve,
    slotsAfterReserve,
    configuredDailyMax,
    outreachSentToday,
    effectiveMarketingMax,
    remainingForOutreach,
  };
}

export async function resendDailyBudgetSnapshot(prisma: PrismaClient): Promise<{
  max: number;
  sentTodayUtc: number;
  remaining: number;
}> {
  const max = micstageResendDailyMax();
  const sentTodayUtc = await countMicstageResendSendsTodayUtc(prisma);
  return { max, sentTodayUtc, remaining: Math.max(0, max - sentTodayUtc) };
}

export async function countPendingListingClaimInvitesWithEmail(prisma: PrismaClient): Promise<number> {
  return countEligiblePendingListingClaimInvites(prisma);
}

/** @deprecated Claim backlog no longer pauses general outreach — paths are separated by eligibility. */
export function growthOutreachPausedWhileClaimInvitesPending(): boolean {
  return false;
}
