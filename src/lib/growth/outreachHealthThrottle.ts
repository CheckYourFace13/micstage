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
};

function outreachHealthMinSample(): number {
  return parseIntEnv("GROWTH_OUTREACH_HEALTH_MIN_SAMPLE", 20);
}

function outreachHealthHardBounceStopRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_HARD_BOUNCE_STOP_RATE?.trim() || "0.05");
}

function outreachHealthHardBounceHalveRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_HARD_BOUNCE_HALVE_RATE?.trim() || "0.03");
}

function outreachHealthComplaintStopRate(): number {
  return parseFloat(process.env.GROWTH_OUTREACH_HEALTH_COMPLAINT_STOP_RATE?.trim() || "0.001");
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

  if (sentSample < outreachHealthMinSample()) {
    if (complaints >= 1) {
      return {
        ok: true,
        reason: "early_complaint_throttle",
        sendMultiplier: 0.25,
        sentSample,
        hardBounces,
        complaints,
        hardBounceRate: sentSample ? hardBounces / sentSample : 0,
        complaintRate: sentSample ? complaints / sentSample : 0,
      };
    }
    return {
      ok: true,
      sendMultiplier: 1,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate: 0,
      complaintRate: 0,
    };
  }

  const hardBounceRate = hardBounces / sentSample;
  const complaintRate = complaints / sentSample;

  if (complaintRate >= outreachHealthComplaintStopRate()) {
    return {
      ok: false,
      reason: `complaint_rate_${(complaintRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
    };
  }
  if (hardBounceRate >= outreachHealthHardBounceStopRate()) {
    return {
      ok: false,
      reason: `hard_bounce_rate_${(hardBounceRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
    };
  }
  if (hardBounceRate >= outreachHealthHardBounceHalveRate()) {
    return {
      ok: true,
      reason: `hard_bounce_rate_halved_${(hardBounceRate * 100).toFixed(2)}pct`,
      sendMultiplier: 0.5,
      sentSample,
      hardBounces,
      complaints,
      hardBounceRate,
      complaintRate,
    };
  }

  return {
    ok: true,
    sendMultiplier: 1,
    sentSample,
    hardBounces,
    complaints,
    hardBounceRate,
    complaintRate,
  };
}
