import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";
import { countEligiblePendingListingClaimInvites } from "@/lib/publicListings/claimInvitePendingCount";
import { resolveClaimInviteRuntimeSnapshot } from "@/lib/publicListings/claimInviteRuntimeSettings";

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

/** When true (default), cold outreach pauses while claim invites remain pending. */
export function growthOutreachPausedWhileClaimInvitesPending(): boolean {
  return process.env.GROWTH_OUTREACH_PAUSE_WHILE_CLAIM_INVITES_PENDING !== "false";
}
