/**
 * Adaptive discovery vs backlog allocation.
 * When NEEDS_REVIEW outruns verification, keep a nationwide trickle and
 * spend the rest of the tick on processing existing inventory.
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
  /** 1 = normal discovery; ~0.12 = nationwide trickle. */
  discoveryIngestMultiplier: number;
  trickleOnly: boolean;
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
  const active =
    input.needsReviewCount > BACKLOG_PRESSURE_NEEDS_REVIEW &&
    input.autoVerifiedToday === 0 &&
    !keepingPace;
  return {
    active,
    needsReviewCount: input.needsReviewCount,
    autoVerifiedToday: input.autoVerifiedToday,
    autoRejectedToday: input.autoRejectedToday,
    listingsCreatedToday: input.listingsCreatedToday,
    keepingPace,
    discoveryIngestMultiplier: active ? 0.12 : 1,
    trickleOnly: active,
    reason: active
      ? `backlog_pressure: NEEDS_REVIEW=${input.needsReviewCount} autoVerifiedToday=0 processed=${processed} created=${input.listingsCreatedToday}`
      : keepingPace
        ? `processing_keeps_pace: verified=${input.autoVerifiedToday} rejected=${input.autoRejectedToday} created=${input.listingsCreatedToday}`
        : `normal_discovery: NEEDS_REVIEW=${input.needsReviewCount}`,
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

export function trickleDiscoveryAdapters(adapterId: string): boolean {
  return adapterId === "autonomous_web_search_venue";
}

export function backlogLimitsUnderPressure(runtime: {
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
    publish: Math.min(8, runtime.backlogPublishPerTick.effective),
    junk: Math.max(runtime.autoRejectJunkPerRun.effective, 250),
    googleVerify: Math.max(runtime.backlogGoogleVerifyPerTick.effective, 12),
    promote: Math.max(runtime.backlogPromotePerTick.effective, 80),
    evidence: Math.max(runtime.backlogEvidenceEnrichPerTick.effective, 40),
    schedule: 16,
    mine: Math.max(runtime.verifiedContactMinePerTick.effective, 28),
    leadReprocess: 10,
  };
}
