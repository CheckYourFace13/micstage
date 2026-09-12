/**
 * Soft / transient bounce deferral (MailboxFull, temporary reject, etc.).
 * Not permanent suppression — blocks re-send for a cooldown window only.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { parseIntEnv } from "@/lib/marketing/emailConfig";

export function softBounceBaseCooldownDays(): number {
  return Math.min(60, Math.max(7, parseIntEnv("MICSTAGE_SOFT_BOUNCE_COOLDOWN_DAYS", 14)));
}

export function softBounceLookbackDays(): number {
  return Math.min(180, Math.max(30, parseIntEnv("MICSTAGE_SOFT_BOUNCE_LOOKBACK_DAYS", 90)));
}

/** Pure: map soft-bounce count in lookback → deferral days from the latest soft bounce. */
export function softBounceDeferralDaysForCount(softCount: number): number {
  const base = softBounceBaseCooldownDays();
  if (softCount <= 0) return 0;
  if (softCount === 1) return base; // default 14d
  if (softCount === 2) return Math.max(base, 30);
  return Math.max(base, 60); // 3+ softs: long deferral, still not permanent
}

export function isWithinSoftBounceDeferral(input: {
  softCountInLookback: number;
  latestSoftAt: Date | null;
  now?: Date;
}): { deferred: boolean; deferUntil: Date | null; deferralDays: number; reason?: string } {
  const days = softBounceDeferralDaysForCount(input.softCountInLookback);
  if (days <= 0 || !input.latestSoftAt) {
    return { deferred: false, deferUntil: null, deferralDays: 0 };
  }
  const now = input.now ?? new Date();
  const deferUntil = new Date(input.latestSoftAt.getTime() + days * 86400000);
  if (now.getTime() < deferUntil.getTime()) {
    return {
      deferred: true,
      deferUntil,
      deferralDays: days,
      reason: `SOFT_BOUNCE_DEFER_${days}D`,
    };
  }
  return { deferred: false, deferUntil, deferralDays: days };
}

export function isSoftBounceLastError(lastError: string | null | undefined): boolean {
  return Boolean(lastError && /^soft_bounce\b/i.test(lastError.trim()));
}

/**
 * True when this inbox had a soft/transient bounce recently enough that marketing
 * (outreach + claim invites) must not retry yet.
 */
export async function getMarketingSoftBounceDeferral(
  prisma: Pick<PrismaClient, "marketingEmailSend">,
  rawEmail: string,
  now = new Date(),
): Promise<{ deferred: boolean; reason?: string; deferUntil?: string; softCount?: number }> {
  const emailNormalized = normalizeMarketingEmail(rawEmail);
  if (!emailNormalized) return { deferred: false };

  const lookback = new Date(now.getTime() - softBounceLookbackDays() * 86400000);
  const softSends = await prisma.marketingEmailSend.findMany({
    where: {
      toEmailNormalized: emailNormalized,
      lastError: { startsWith: "soft_bounce" },
      sentAt: { gte: lookback },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true, lastError: true, updatedAt: true },
    take: 20,
  });

  // Prefer updatedAt when lastError was rewritten after a misclassification clear.
  const latestSoftAt =
    softSends.length > 0
      ? softSends.reduce<Date | null>((latest, row) => {
          const t = Math.max(row.sentAt?.getTime() ?? 0, row.updatedAt?.getTime() ?? 0);
          if (!latest || t > latest.getTime()) return new Date(t);
          return latest;
        }, null)
      : null;

  const counted = softSends.filter((s) => isSoftBounceLastError(s.lastError));
  const verdict = isWithinSoftBounceDeferral({
    softCountInLookback: counted.length,
    latestSoftAt,
    now,
  });

  if (!verdict.deferred) return { deferred: false, softCount: counted.length };
  return {
    deferred: true,
    reason: verdict.reason,
    deferUntil: verdict.deferUntil?.toISOString(),
    softCount: counted.length,
  };
}
