import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";

export type OutreachHealthSnapshot = {
  ok: boolean;
  reason?: string;
  /** Multiplier applied to per-cron cap (0 = stop). */
  sendMultiplier: number;
  sentSample: number;
  hardBounces: number;
  complaints: number;
  hardBounceRate: number;
  complaintRate: number;
  /** Denominator used for rates (max(sentSample, minSample) when protecting against under-sample reopen). */
  rateDenominator: number;
};

export function outreachHealthMinSample(): number {
  return parseIntEnv("GROWTH_OUTREACH_HEALTH_MIN_SAMPLE", 20);
}

export function outreachHealthHardBounceStopRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_HARD_BOUNCE_STOP_RATE?.trim() || "0.05");
}

export function outreachHealthHardBounceHalveRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_HARD_BOUNCE_HALVE_RATE?.trim() || "0.03");
}

export function outreachHealthComplaintStopRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_COMPLAINT_STOP_RATE?.trim() || "0.001");
}

/**
 * Pure health evaluation from window counts.
 *
 * Critical: when sample &lt; minSample, rates still use max(sentSample, minSample) as denominator
 * whenever hardBounces or complaints are present — so aging from 20→19 with 3 hard bounces
 * cannot reopen full send (STOP → sample 19 → FULL → sample 20 → STOP oscillation).
 */
export function evaluateOutreachHealthFromCounts(input: {
  sentSample: number;
  hardBounces: number;
  complaints: number;
  minSample?: number;
  hardBounceStopRate?: number;
  hardBounceHalveRate?: number;
  complaintStopRate?: number;
}): OutreachHealthSnapshot {
  const minSample = input.minSample ?? outreachHealthMinSample();
  const stopRate = input.hardBounceStopRate ?? outreachHealthHardBounceStopRate();
  const halveRate = input.hardBounceHalveRate ?? outreachHealthHardBounceHalveRate();
  const complaintStop = input.complaintStopRate ?? outreachHealthComplaintStopRate();
  const sentSample = Math.max(0, input.sentSample);
  const hardBounces = Math.max(0, input.hardBounces);
  const complaints = Math.max(0, input.complaints);

  const hasAdverse = hardBounces > 0 || complaints > 0;
  // Conservative denominator while adverse signals remain — prevents under-sample reopen.
  const rateDenominator = hasAdverse ? Math.max(sentSample, minSample) : Math.max(sentSample, 1);
  const hardBounceRate = hardBounces / rateDenominator;
  const complaintRate = complaints / rateDenominator;

  if (complaints >= 1 && complaintRate >= complaintStop) {
    return {
      ok: false,
      reason: `complaint_rate_${(complaintRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
      rateDenominator,
    };
  }

  // Early window with a complaint but below stop threshold (e.g. tiny sample): still throttle hard.
  if (sentSample < minSample && complaints >= 1) {
    return {
      ok: true,
      reason: "early_complaint_throttle",
      sendMultiplier: 0.25,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
      rateDenominator,
    };
  }

  if (hardBounceRate >= stopRate) {
    return {
      ok: false,
      reason: `hard_bounce_rate_${(hardBounceRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
      rateDenominator,
    };
  }

  if (hardBounceRate >= halveRate) {
    return {
      ok: true,
      reason: `hard_bounce_rate_halved_${(hardBounceRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0.5,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
      rateDenominator,
    };
  }

  // Recovering from a recent stop while hard bounces still linger below stop but sample is thin:
  // keep probationary half-rate until either bounces age out or sample rebuilds above min with clean rate.
  if (sentSample < minSample && hardBounces > 0) {
    return {
      ok: true,
      reason: "post_stop_probation_undersample",
      sendMultiplier: 0.5,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
      rateDenominator,
    };
  }

  return {
    ok: true,
    sendMultiplier: 1,
    sentSample,
    hardBounces,
    complaints,
    hardBounceRate: sentSample ? hardBounces / Math.max(sentSample, 1) : 0,
    complaintRate: sentSample ? complaints / Math.max(sentSample, 1) : 0,
    rateDenominator: Math.max(sentSample, 1),
  };
}

/** Conservative automatic marketing throttle based on recent OUTREACH delivery signals. */
export async function evaluateOutreachSendHealth(prisma: PrismaClient): Promise<OutreachHealthSnapshot> {
  const windowDays = parseIntEnv("GROWTH_OUTREACH_HEALTH_WINDOW_DAYS", 7);
  const since = new Date(Date.now() - windowDays * 86400000);

  const [sentSample, hardBounces, complaints] = await Promise.all([
    prisma.marketingEmailSend.count({
      where: { category: "OUTREACH", status: "SENT", sentAt: { gte: since } },
    }),
    prisma.marketingEmailSend.count({
      where: { category: "OUTREACH", bouncedAt: { gte: since } },
    }),
    prisma.marketingEmailSend.count({
      where: { category: "OUTREACH", complainedAt: { gte: since } },
    }),
  ]);

  return evaluateOutreachHealthFromCounts({ sentSample, hardBounces, complaints });
}
