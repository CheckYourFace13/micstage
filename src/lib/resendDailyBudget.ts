import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";

/** Resend free tier is 100/day — stay under with headroom for password resets & booking reminders. */
export function micstageResendDailyMax(): number {
  return parseIntEnv("MICSTAGE_RESEND_DAILY_MAX", 85);
}

export function listingClaimInvitesPerCron(): number {
  return Math.min(20, Math.max(1, parseIntEnv("LISTING_CLAIM_INVITES_PER_CRON", 5)));
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

export function growthOutreachPausedWhileClaimInvitesPending(): boolean {
  return process.env.GROWTH_OUTREACH_PAUSE_WHILE_CLAIM_INVITES_PENDING !== "false";
}

export async function countPendingListingClaimInvitesWithEmail(prisma: PrismaClient): Promise<number> {
  return prisma.publicOpenMicListing.count({
    where: {
      claimInviteEmailSentAt: null,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: { not: "OUTDATED" },
      growthLead: { contactEmailNormalized: { not: null } },
    },
  });
}
