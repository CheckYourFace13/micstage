import type { PrismaClient } from "@/generated/prisma/client";
import { growthAutoDraftBatchLimit, growthAutoDraftFitMin } from "@/lib/growth/expansionConfig";
import { createPendingGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadOutreachDraftCreate";
import { sendApprovedGrowthLeadDraft } from "@/lib/growth/growthLeadDraftSend";
import {
  isOnlyTransientMarketingThrottle,
  reasonsIncludeGlobalCategoryDailyCap,
  remainingOutreachDailySends,
} from "@/lib/marketing/sendCaps";

/**
 * Auto-creates PENDING_REVIEW drafts for approved (or high-fit reviewed) leads with email.
 * Does not send. Safe for queued markets (drafts are allowed; sends are gated separately).
 */
export async function runAutoGrowthOutreachDrafts(prisma: PrismaClient): Promise<{
  created: number;
  autoApprovedVenue: number;
  autoSentVenue: number;
  /** APPROVED backlog sends completed this run (after venue auto-send), bounded by daily OUTREACH cap. */
  approvedQueueDrained: number;
  nonEmailVenuePathsQueued: number;
  skipped: number;
  errors: string[];
  rejectionReasonsByCount: Record<string, number>;
}> {
  const fitMin = growthAutoDraftFitMin();
  const venueAutoFitMin = Math.max(6, fitMin - 1);
  const limit = growthAutoDraftBatchLimit();

  const candidates = await prisma.growthLead.findMany({
    where: {
      contactEmailNormalized: { not: null },
      OR: [
        // Keep existing non-venue behavior.
        { status: "APPROVED" },
        { status: "REVIEWED", fitScore: { gte: fitMin } },
        // Venue-first: allow strong newly discovered autonomous venues into draft automation.
        {
          leadType: "VENUE",
          status: "DISCOVERED",
          fitScore: { gte: venueAutoFitMin },
          openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
        },
      ],
      outreachDrafts: { none: { status: { in: ["PENDING_REVIEW", "APPROVED", "SENT"] } } },
    },
    select: { id: true },
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  let created = 0;
  let autoApprovedVenue = 0;
  let autoSentVenue = 0;
  let nonEmailVenuePathsQueued = 0;
  let skipped = 0;
  const errors: string[] = [];
  const rejectionReasonsByCount: Record<string, number> = {};
  const bumpReason = (reason: string) => {
    const k = reason.trim().slice(0, 220);
    rejectionReasonsByCount[k] = (rejectionReasonsByCount[k] ?? 0) + 1;
  };
  const activeMarkets = await prisma.growthLaunchMarket.findMany({
    where: { status: "ACTIVE" },
    select: { discoveryMarketSlug: true },
  });
  const activeMarketSet = new Set(activeMarkets.map((m) => m.discoveryMarketSlug.trim().toLowerCase()));

  for (const c of candidates) {
    const r = await createPendingGrowthLeadOutreachDraft(prisma, c.id);
    if (r.ok) {
      created++;
    } else {
      skipped++;
      bumpReason(r.reason);
      if (!r.reason.includes("already has")) {
        errors.push(`${c.id}: ${r.reason}`);
      }
    }
  }

  const venuePriority = await prisma.growthLeadOutreachDraft.findMany({
    where: {
      status: "PENDING_REVIEW",
      lead: {
        leadType: "VENUE",
        OR: [{ status: "DISCOVERED" }, { status: "REVIEWED" }, { status: "APPROVED" }],
        fitScore: { gte: venueAutoFitMin },
        openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
      },
    },
    include: { lead: true },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });

  for (const d of venuePriority.sort((a, b) => (b.lead.fitScore ?? 0) - (a.lead.fitScore ?? 0))) {
    const slug = d.lead.discoveryMarketSlug?.trim().toLowerCase();
    if (!slug || !activeMarketSet.has(slug)) {
      continue;
    }
    await prisma.growthLeadOutreachDraft.update({
      where: { id: d.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByEmail: "auto-venue-priority",
      },
    });
    autoApprovedVenue++;
    const sent = await sendApprovedGrowthLeadDraft(prisma, d.id);
    if (sent.ok) autoSentVenue++;
    else {
      for (const reason of sent.reasons) {
        bumpReason(`send_blocked: ${reason}`);
      }
      errors.push(`${d.id}: auto send blocked (${sent.reasons.join(" | ").slice(0, 300)})`);
    }
  }

  let approvedQueueDrained = 0;
  let remainingHeadroom = await remainingOutreachDailySends(prisma);
  if (remainingHeadroom > 0) {
    const maxBatch = Math.min(2000, Math.max(remainingHeadroom + 200, limit * 4));
    const backlogRaw = await prisma.growthLeadOutreachDraft.findMany({
      where: { status: "APPROVED", marketingEmailSendId: null },
      include: { lead: true },
      orderBy: { createdAt: "asc" },
      take: maxBatch,
    });
    const backlog = backlogRaw.filter((d) => {
      const slug = (d.discoveryMarketSlug ?? d.lead.discoveryMarketSlug ?? "").trim().toLowerCase();
      return slug && activeMarketSet.has(slug);
    });

    for (const d of backlog) {
      if (remainingHeadroom <= 0) break;
      const sent = await sendApprovedGrowthLeadDraft(prisma, d.id);
      if (sent.ok) {
        approvedQueueDrained++;
        remainingHeadroom--;
      } else if (reasonsIncludeGlobalCategoryDailyCap(sent.reasons)) {
        break;
      } else if (!isOnlyTransientMarketingThrottle(sent.reasons)) {
        for (const reason of sent.reasons) {
          bumpReason(`queue_send_blocked: ${reason}`);
        }
        errors.push(`${d.id}: approved queue send blocked (${sent.reasons.join(" | ").slice(0, 300)})`);
      }
    }
  }

  // Non-email venue path tasks are queued during ingest via MarketingJob; expose dashboard count.
  nonEmailVenuePathsQueued = await prisma.marketingJob.count({
    where: { kind: "SOCIAL_PAYLOAD_RENDER", status: "PENDING" },
  });

  if (autoApprovedVenue === 0 || autoSentVenue === 0) {
    console.info("[growth drafts] venue auto-send diagnostics", {
      fitMin,
      venueAutoFitMin,
      createdDrafts: created,
      autoApprovedVenue,
      autoSentVenue,
      activeMarketCount: activeMarketSet.size,
      errorCount: errors.length,
    });
  }

  return {
    created,
    autoApprovedVenue,
    autoSentVenue,
    approvedQueueDrained,
    nonEmailVenuePathsQueued,
    skipped,
    errors,
    rejectionReasonsByCount,
  };
}
