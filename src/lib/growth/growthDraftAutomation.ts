import type {
  GrowthLead,
  GrowthLeadEmailConfidence,
  GrowthLeadOutreachDraft,
  GrowthLeadSourceKind,
  PrismaClient,
} from "@/generated/prisma/client";
import {
  growthAutoDraftBatchLimit,
  growthAutoDraftFitMin,
  growthOutreachSendsPerCronRun,
} from "@/lib/growth/expansionConfig";
import { createPendingGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadOutreachDraftCreate";
import { sendApprovedGrowthLeadDraft } from "@/lib/growth/growthLeadDraftSend";
import {
  isOnlyTransientMarketingThrottle,
  reasonsIncludeGlobalCategoryDailyCap,
  remainingGrowthOutreachAutomationBudget,
} from "@/lib/marketing/sendCaps";

type GrowthDraftWithLead = GrowthLeadOutreachDraft & { lead: GrowthLead };

/** CSV / admin uploads often stay DISCOVERED with no open-mic tier — still eligible for automation when email is strong. */
function sourceSkipsDiscoveredStrictGate(sourceKind: GrowthLeadSourceKind): boolean {
  return (
    sourceKind === "MANUAL_ADMIN" ||
    sourceKind === "CSV_IMPORT" ||
    sourceKind === "CLAUDE_CSV" ||
    sourceKind === "WEBSITE_CONTACT"
  );
}

function sortDraftsByFitThenCreated<T extends { lead: { fitScore: number | null }; createdAt: Date }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const df = (b.lead.fitScore ?? 0) - (a.lead.fitScore ?? 0);
    if (df !== 0) return df;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Pending venue drafts that may enter automation (never LOW / missing confidence). */
function venuePendingPassesAutomationGate(
  d: GrowthDraftWithLead,
  venueAutoFitMin: number,
  _activeMarketSet: Set<string>,
  allowMediumOutreach: boolean,
): boolean {
  if (d.lead.leadType !== "VENUE" || d.status !== "PENDING_REVIEW") return false;
  if (!(d.lead.status === "DISCOVERED" || d.lead.status === "REVIEWED" || d.lead.status === "APPROVED")) return false;
  const fs = d.lead.fitScore;
  if (fs != null && fs < venueAutoFitMin) return false;
  if (d.lead.status === "DISCOVERED") {
    if (!sourceSkipsDiscoveredStrictGate(d.lead.sourceKind)) {
      const t = d.lead.openMicSignalTier;
      if (!(t === "EXPLICIT_OPEN_MIC" || t === "STRONG_LIVE_EVENT")) return false;
    }
  }
  const conf = d.lead.contactEmailConfidence;
  if (conf == null || conf === "LOW") return false;
  if (conf === "MEDIUM" && !allowMediumOutreach) return false;
  return conf === "HIGH" || conf === "MEDIUM";
}

/** Pending artist/promoter drafts — same confidence rules; no venue-only fit/tier gates. */
function nonVenuePendingPassesAutomationGate(d: GrowthDraftWithLead, allowMediumOutreach: boolean): boolean {
  if (d.lead.leadType === "VENUE" || d.status !== "PENDING_REVIEW") return false;
  if (!(d.lead.status === "DISCOVERED" || d.lead.status === "REVIEWED" || d.lead.status === "APPROVED")) return false;
  const conf = d.lead.contactEmailConfidence;
  if (conf == null || conf === "LOW") return false;
  if (conf === "MEDIUM" && !allowMediumOutreach) return false;
  return conf === "HIGH" || conf === "MEDIUM";
}

function backlogPassesAutomationGate(d: GrowthDraftWithLead, _activeMarketSet: Set<string>, allowMediumOutreach: boolean): boolean {
  if (d.status !== "APPROVED" || d.marketingEmailSendId != null) return false;
  const conf = d.lead.contactEmailConfidence;
  if (conf == null || conf === "LOW") return false;
  if (conf === "MEDIUM" && !allowMediumOutreach) return false;
  return conf === "HIGH" || conf === "MEDIUM";
}

/**
 * Auto-creates PENDING_REVIEW drafts for eligible leads, then may auto-approve + send pending venue drafts
 * (fit/tier rules), pending artist/promoter drafts (confidence only), then APPROVED backlog (bounded by caps).
 */
export async function runAutoGrowthOutreachDrafts(prisma: PrismaClient): Promise<{
  created: number;
  autoApprovedVenue: number;
  autoSentVenue: number;
  /** APPROVED backlog sends completed this run (after venue auto-send), bounded by daily OUTREACH cap. */
  approvedQueueDrained: number;
  /** Successful outreach sends this run (venue auto + backlog); capped per cron for burst smoothing. */
  outreachSendsThisRun: number;
  /** Effective cap on outreachSendsThisRun for this invocation (min(daily room left, GROWTH_OUTREACH_SENDS_PER_CRON_RUN)). */
  outreachSendCapPerRun: number;
  /** UTC-day outreach automation budget snapshot (before this run’s sends). */
  outreachAutomationBudget: {
    sentTodayUtc: number;
    marketingOutreachCap: number;
    growthDailyMax: number;
    effectiveDailyMax: number;
    dailyTarget: number;
    remainingToEffectiveMax: number;
  };
  /** Successful sends attributed to fallback wave (venue pending → non-venue pending → backlog). */
  outreachSendsByFallbackWave: {
    venuePendingHigh: number;
    venuePendingMedium: number;
    nonVenuePendingHigh: number;
    nonVenuePendingMedium: number;
    backlogReviewedApprovedHigh: number;
    backlogReviewedApprovedMedium: number;
    backlogOtherHigh: number;
    backlogOtherMedium: number;
  };
  nonEmailVenuePathsQueued: number;
  skipped: number;
  errors: string[];
  rejectionReasonsByCount: Record<string, number>;
}> {
  const fitMin = growthAutoDraftFitMin();
  const venueAutoFitMin = Math.max(6, fitMin - 1);
  const limit = growthAutoDraftBatchLimit();
  const perCronSendCeiling = growthOutreachSendsPerCronRun();
  const draftWorkTake = Math.min(limit, Math.max(24, perCronSendCeiling * 8));
  const venueReviewTake = Math.min(limit, Math.max(12, perCronSendCeiling * 6));
  let outreachSendsThisRun = 0;
  const allowMediumOutreach = process.env.GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE === "true";
  const emailReadyLevels: GrowthLeadEmailConfidence[] = allowMediumOutreach ? ["HIGH", "MEDIUM"] : ["HIGH"];

  const candidates = await prisma.growthLead.findMany({
    where: {
      contactEmailNormalized: { not: null },
      contactEmailConfidence: { in: emailReadyLevels },
      OR: [
        // Keep existing non-venue behavior.
        { status: "APPROVED" },
        // REVIEWED: fit score when present; null fit (common on imports) still eligible with valid email.
        { status: "REVIEWED", OR: [{ fitScore: { gte: fitMin } }, { fitScore: null }] },
        // Venue-first: allow strong newly discovered autonomous venues into draft automation.
        {
          leadType: "VENUE",
          status: "DISCOVERED",
          fitScore: { gte: venueAutoFitMin },
          openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
        },
      ],
      outreachDrafts: { none: { status: { in: ["PENDING_REVIEW", "APPROVED"] } } },
    },
    select: { id: true },
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: draftWorkTake,
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

  /**
   * Venue auto-send: pick PENDING_REVIEW drafts for venues that already passed draft creation.
   * Draft candidates can enter via APPROVED / REVIEWED(fit) without strong open-mic tier, but the old
   * venuePriority query required EXPLICIT/STRONG tier for every status — excluding those rows entirely
   * and yielding autoApprovedVenue=0 even in ACTIVE markets. Tier is still enforced below for DISCOVERED only.
   */
  const venuePriority = await prisma.growthLeadOutreachDraft.findMany({
    where: {
      status: "PENDING_REVIEW",
      lead: {
        leadType: "VENUE",
        AND: [
          { OR: [{ status: "DISCOVERED" }, { status: "REVIEWED" }, { status: "APPROVED" }] },
          { OR: [{ fitScore: { gte: venueAutoFitMin } }, { fitScore: null }] },
        ],
      },
    },
    include: { lead: true },
    orderBy: [{ createdAt: "asc" }],
    take: venueReviewTake,
  });

  const nonVenuePending = await prisma.growthLeadOutreachDraft.findMany({
    where: {
      status: "PENDING_REVIEW",
      lead: {
        leadType: { in: ["ARTIST", "PROMOTER_ACCOUNT"] },
        OR: [{ status: "DISCOVERED" }, { status: "REVIEWED" }, { status: "APPROVED" }],
      },
    },
    include: { lead: true },
    orderBy: [{ createdAt: "asc" }],
    take: venueReviewTake,
  });

  const outreachAutomationBudget = await remainingGrowthOutreachAutomationBudget(prisma);
  const outreachSendCapPerRun = Math.min(
    outreachAutomationBudget.remainingToEffectiveMax,
    perCronSendCeiling,
  );
  let remainingHeadroom = outreachAutomationBudget.remainingToEffectiveMax;

  const outreachSendsByFallbackWave = {
    venuePendingHigh: 0,
    venuePendingMedium: 0,
    nonVenuePendingHigh: 0,
    nonVenuePendingMedium: 0,
    backlogReviewedApprovedHigh: 0,
    backlogReviewedApprovedMedium: 0,
    backlogOtherHigh: 0,
    backlogOtherMedium: 0,
  };

  const eligiblePendingVenue = sortDraftsByFitThenCreated(
    (venuePriority as GrowthDraftWithLead[]).filter((d) =>
      venuePendingPassesAutomationGate(d, venueAutoFitMin, activeMarketSet, allowMediumOutreach),
    ),
  );
  const pendingHigh = eligiblePendingVenue.filter((d) => d.lead.contactEmailConfidence === "HIGH");
  const pendingMedium = allowMediumOutreach
    ? eligiblePendingVenue.filter((d) => d.lead.contactEmailConfidence === "MEDIUM")
    : [];

  async function approveAndTrySendPendingDraft(
    d: GrowthDraftWithLead,
    wave: keyof typeof outreachSendsByFallbackWave,
    approvedByEmail: string,
    bumpAutoApprovedVenueCount: boolean,
  ): Promise<void> {
    if (outreachSendsThisRun >= outreachSendCapPerRun || remainingHeadroom <= 0) return;
    await prisma.growthLeadOutreachDraft.update({
      where: { id: d.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByEmail,
      },
    });
    if (bumpAutoApprovedVenueCount) autoApprovedVenue++;
    const sent = await sendApprovedGrowthLeadDraft(prisma, d.id);
    if (sent.ok) {
      autoSentVenue++;
      outreachSendsThisRun++;
      remainingHeadroom--;
      outreachSendsByFallbackWave[wave]++;
    } else {
      for (const reason of sent.reasons) {
        bumpReason(`send_blocked: ${reason}`);
      }
      errors.push(`${d.id}: auto send blocked (${sent.reasons.join(" | ").slice(0, 300)})`);
    }
  }

  for (const d of pendingHigh) {
    if (outreachSendsThisRun >= outreachSendCapPerRun || remainingHeadroom <= 0) break;
    await approveAndTrySendPendingDraft(d, "venuePendingHigh", "auto-venue-priority", true);
  }
  for (const d of pendingMedium) {
    if (outreachSendsThisRun >= outreachSendCapPerRun || remainingHeadroom <= 0) break;
    await approveAndTrySendPendingDraft(d, "venuePendingMedium", "auto-venue-priority", true);
  }

  const eligibleNonVenuePending = sortDraftsByFitThenCreated(
    (nonVenuePending as GrowthDraftWithLead[]).filter((d) => nonVenuePendingPassesAutomationGate(d, allowMediumOutreach)),
  );
  const nonVenueHigh = eligibleNonVenuePending.filter((d) => d.lead.contactEmailConfidence === "HIGH");
  const nonVenueMedium = allowMediumOutreach
    ? eligibleNonVenuePending.filter((d) => d.lead.contactEmailConfidence === "MEDIUM")
    : [];
  for (const d of nonVenueHigh) {
    if (outreachSendsThisRun >= outreachSendCapPerRun || remainingHeadroom <= 0) break;
    await approveAndTrySendPendingDraft(d, "nonVenuePendingHigh", "auto-growth-priority", false);
  }
  for (const d of nonVenueMedium) {
    if (outreachSendsThisRun >= outreachSendCapPerRun || remainingHeadroom <= 0) break;
    await approveAndTrySendPendingDraft(d, "nonVenuePendingMedium", "auto-growth-priority", false);
  }

  let approvedQueueDrained = 0;
  if (remainingHeadroom > 0 && outreachSendsThisRun < outreachSendCapPerRun) {
    const sendSlotsLeft = outreachSendCapPerRun - outreachSendsThisRun;
    const backlogTake = Math.min(2000, Math.max(200, sendSlotsLeft * 40));
    const backlogRaw = await prisma.growthLeadOutreachDraft.findMany({
      where: { status: "APPROVED", marketingEmailSendId: null },
      include: { lead: true },
      orderBy: { createdAt: "asc" },
      take: backlogTake,
    });
    const backlogAll = (backlogRaw as GrowthDraftWithLead[]).filter((d) =>
      backlogPassesAutomationGate(d, activeMarketSet, allowMediumOutreach),
    );
    const waveReviewedApproved = backlogAll.filter(
      (d) => d.lead.status === "REVIEWED" || d.lead.status === "APPROVED",
    );
    const waveRaIds = new Set(waveReviewedApproved.map((d) => d.id));
    const waveOther = backlogAll.filter((d) => !waveRaIds.has(d.id));

    const waves: { rows: GrowthDraftWithLead[]; wave: keyof typeof outreachSendsByFallbackWave }[] = [
      {
        rows: sortDraftsByFitThenCreated(waveReviewedApproved.filter((d) => d.lead.contactEmailConfidence === "HIGH")),
        wave: "backlogReviewedApprovedHigh",
      },
      {
        rows: sortDraftsByFitThenCreated(
          allowMediumOutreach
            ? waveReviewedApproved.filter((d) => d.lead.contactEmailConfidence === "MEDIUM")
            : [],
        ),
        wave: "backlogReviewedApprovedMedium",
      },
      {
        rows: sortDraftsByFitThenCreated(waveOther.filter((d) => d.lead.contactEmailConfidence === "HIGH")),
        wave: "backlogOtherHigh",
      },
      {
        rows: sortDraftsByFitThenCreated(
          allowMediumOutreach ? waveOther.filter((d) => d.lead.contactEmailConfidence === "MEDIUM") : [],
        ),
        wave: "backlogOtherMedium",
      },
    ];

    let abortBacklogForGlobalCap = false;
    for (const { rows, wave } of waves) {
      if (abortBacklogForGlobalCap) break;
      for (const d of rows) {
        if (remainingHeadroom <= 0 || outreachSendsThisRun >= outreachSendCapPerRun) break;
        const sent = await sendApprovedGrowthLeadDraft(prisma, d.id);
        if (sent.ok) {
          approvedQueueDrained++;
          remainingHeadroom--;
          outreachSendsThisRun++;
          outreachSendsByFallbackWave[wave]++;
        } else if (reasonsIncludeGlobalCategoryDailyCap(sent.reasons)) {
          abortBacklogForGlobalCap = true;
          break;
        } else if (!isOnlyTransientMarketingThrottle(sent.reasons)) {
          for (const reason of sent.reasons) {
            bumpReason(`queue_send_blocked: ${reason}`);
          }
          errors.push(`${d.id}: approved queue send blocked (${sent.reasons.join(" | ").slice(0, 300)})`);
        }
      }
    }
  }

  // Non-email venue path tasks are queued during ingest via MarketingJob; expose dashboard count.
  nonEmailVenuePathsQueued = await prisma.marketingJob.count({
    where: { kind: "SOCIAL_PAYLOAD_RENDER", status: "PENDING" },
  });

  const capNarrowedByMarketing =
    outreachAutomationBudget.marketingOutreachCap < outreachAutomationBudget.growthDailyMax;
  const approxSentTodayAfterRun = outreachAutomationBudget.sentTodayUtc + outreachSendsThisRun;
  const softHeadroomTowardDailyTarget = Math.max(
    0,
    outreachAutomationBudget.dailyTarget - approxSentTodayAfterRun,
  );
  console.info("[growth outreach automation]", {
    fitMin,
    venueAutoFitMin,
    createdDrafts: created,
    autoApprovedVenue,
    autoSentVenue,
    approvedQueueDrained,
    outreachAutomationBudget,
    capNarrowedByMarketing,
    outreachSendCapPerRun,
    outreachSendsThisRun,
    approxSentTodayAfterRun,
    softHeadroomTowardDailyTarget,
    outreachSendsByFallbackWave,
    activeMarketCount: activeMarketSet.size,
    errorCount: errors.length,
  });

  return {
    created,
    autoApprovedVenue,
    autoSentVenue,
    approvedQueueDrained,
    outreachSendsThisRun,
    outreachSendCapPerRun,
    outreachAutomationBudget,
    outreachSendsByFallbackWave,
    nonEmailVenuePathsQueued,
    skipped,
    errors,
    rejectionReasonsByCount,
  };
}
