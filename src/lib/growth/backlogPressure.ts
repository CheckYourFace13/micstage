/**
 * Processing-health signal only.
 *
 * A large NEEDS_REVIEW / raw reservoir is an asset, not a reason to slow
 * nationwide discovery. Discovery always runs at the maximum safe rate
 * allowed by Serp/API budgets, provider quotas, cost caps, and crawl safety.
 *
 * Alert only when processing has actually stalled (tick running, work arriving,
 * and nothing verified or rejected).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { chicagoLast24hWindow } from "@/lib/ownerSummary/chicagoWindow";

export const BACKLOG_PRESSURE_NEEDS_REVIEW = 1000;

export type BacklogPressure = {
  active: boolean;
  needsReviewCount: number;
  autoVerifiedToday: number;
  autoRejectedToday: number;
  listingsCreatedToday: number;
  keepingPace: boolean;
  /** Always 1 — discovery is never throttled by backlog size. */
  discoveryIngestMultiplier: number;
  /** Always false — raw discovery and processing run in parallel. */
  trickleOnly: boolean;
  processingStalled: boolean;
  reason: string;
};

export function backlogPressureFromCounts(input: {
  needsReviewCount: number;
  autoVerifiedToday: number;
  autoRejectedToday: number;
  listingsCreatedToday: number;
}): BacklogPressure {
  const processed = input.autoVerifiedToday + input.autoRejectedToday;
  const keepingPace =
    input.autoVerifiedToday > 0 ||
    (input.listingsCreatedToday > 0 && processed >= input.listingsCreatedToday);
  /** Tick-side work arrived but nothing was verified or rejected. */
  const processingStalled =
    input.needsReviewCount >= 200 &&
    input.autoVerifiedToday === 0 &&
    input.autoRejectedToday === 0 &&
    input.listingsCreatedToday > 0;
  return {
    active: processingStalled,
    needsReviewCount: input.needsReviewCount,
    autoVerifiedToday: input.autoVerifiedToday,
    autoRejectedToday: input.autoRejectedToday,
    listingsCreatedToday: input.listingsCreatedToday,
    keepingPace,
    discoveryIngestMultiplier: 1,
    trickleOnly: false,
    processingStalled,
    reason: processingStalled
      ? `processing_stalled: NEEDS_REVIEW=${input.needsReviewCount} verified=0 rejected=0 created=${input.listingsCreatedToday}`
      : keepingPace
        ? `processing_keeps_pace: verified=${input.autoVerifiedToday} rejected=${input.autoRejectedToday} created=${input.listingsCreatedToday}`
        : `reservoir_ok: NEEDS_REVIEW=${input.needsReviewCount} processed=${processed} created=${input.listingsCreatedToday}`,
  };
}

export async function evaluateBacklogPressure(
  prisma: PrismaClient,
  now = new Date(),
): Promise<BacklogPressure> {
  const { startUtc, endUtc } = chicagoLast24hWindow(now);
  const [needsReviewCount, autoVerifiedToday, autoRejectedToday, listingsCreatedToday] = await Promise.all([
    prisma.publicOpenMicListing.count({
      where: { claimedVenueId: null, verificationStatus: "NEEDS_REVIEW" },
    }),
    prisma.publicOpenMicListing.count({
      where: {
        verificationStatus: "VERIFIED",
        lastVerifiedAt: { gte: startUtc, lt: endUtc },
        internalNotes: { contains: "auto-promote" },
      },
    }),
    prisma.publicOpenMicListing.count({
      where: {
        verificationStatus: "OUTDATED",
        updatedAt: { gte: startUtc, lt: endUtc },
        internalNotes: { contains: "auto-reject" },
      },
    }),
    prisma.publicOpenMicListing.count({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
    }),
  ]);
  return backlogPressureFromCounts({
    needsReviewCount,
    autoVerifiedToday,
    autoRejectedToday,
    listingsCreatedToday,
  });
}

/** @deprecated Discovery is never trickle-gated. Kept for call-site compatibility. */
export function trickleDiscoveryAdapters(_adapterId: string): boolean {
  return true;
}

/**
 * Independent full-speed processing budgets.
 * Never reduce publish because the raw reservoir is large.
 */
export function independentProcessingBudgets(runtime: {
  backlogPublishPerTick: { effective: number };
  backlogGoogleVerifyPerTick: { effective: number };
  backlogPromotePerTick: { effective: number };
  backlogEvidenceEnrichPerTick: { effective: number };
  autoRejectJunkPerRun: { effective: number };
  verifiedContactMinePerTick: { effective: number };
}): {
  publish: number;
  junk: number;
  googleVerify: number;
  promote: number;
  evidence: number;
  schedule: number;
  mine: number;
  leadReprocess: number;
} {
  return {
    publish: Math.max(runtime.backlogPublishPerTick.effective, 40),
    junk: Math.max(runtime.autoRejectJunkPerRun.effective, 250),
    googleVerify: Math.max(runtime.backlogGoogleVerifyPerTick.effective, 12),
    promote: Math.max(runtime.backlogPromotePerTick.effective, 80),
    evidence: Math.max(runtime.backlogEvidenceEnrichPerTick.effective, 40),
    schedule: 32,
    mine: Math.max(runtime.verifiedContactMinePerTick.effective, 32),
    leadReprocess: 40,
  };
}

/** @deprecated Use {@link independentProcessingBudgets}. */
export function backlogLimitsUnderPressure(
  runtime: Parameters<typeof independentProcessingBudgets>[0],
): ReturnType<typeof independentProcessingBudgets> {
  return independentProcessingBudgets(runtime);
}
