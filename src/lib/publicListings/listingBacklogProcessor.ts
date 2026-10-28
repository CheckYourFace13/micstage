import type { PrismaClient } from "@/generated/prisma/client";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { autoPublishGrowthLeadsAsListings } from "@/lib/publicListings/autoPublishGrowthLeadsAsListings";
import { autoRejectJunkListings } from "@/lib/publicListings/autoRejectJunkListings";
import { enrichListingsMissingTrustedEvidence } from "@/lib/publicListings/evidenceEnrichment";
import { verifyPublicListingsWithGoogle } from "@/lib/publicListings/googlePlacesVerify";
import { promotePlaceConfirmedListings } from "@/lib/publicListings/promotePlaceConfirmedListings";
import { mineVerifiedListingOfficialEmails } from "@/lib/publicListings/mineVerifiedListingContacts";
import { enrichGrowthLeadOfficialEvidence } from "@/lib/growth/outreachEvidenceEnrichment";
import { enrichVerifiedListingSchedules } from "@/lib/publicListings/listingScheduleEnrichment";
import { micstagePromotionKillSwitch } from "@/lib/publicListings/automationKillSwitches";
import {
  resolveGrowthPipelineRuntimeSnapshot,
  type GrowthPipelineRuntimeSnapshot,
} from "@/lib/growth/growthRuntimeSettings";
import {
  evaluateBacklogPressure,
  independentProcessingBudgets,
  type BacklogPressure,
} from "@/lib/growth/backlogPressure";

const BACKLOG_ADAPTER = "listing_backlog_processor";
const BACKLOG_MARKET = "_global";
const REPROCESS_CURSOR_KEY = "lead_reprocess_updated_at";

/** Soft wall-clock budget so Hostinger nginx does not 504 mid-pipeline. */
const TICK_BUDGET_MS = 55_000;

export type ListingBacklogProcessorResult = {
  published: number;
  publishSkipped: number;
  rejectedFromBacklog: number;
  rejectReasons: Record<string, number>;
  publishBacklogRemaining: number;
  googleVerify: Awaited<ReturnType<typeof verifyPublicListingsWithGoogle>>;
  promoted: number;
  junkRejected: number;
  junkByReason: Record<string, number>;
  evidenceEnrich: Awaited<ReturnType<typeof enrichListingsMissingTrustedEvidence>>;
  outreachEvidenceEnrich: Awaited<ReturnType<typeof enrichGrowthLeadOfficialEvidence>>;
  scheduleEnrich: Awaited<ReturnType<typeof enrichVerifiedListingSchedules>>;
  contactMine: Awaited<ReturnType<typeof mineVerifiedListingOfficialEmails>>;
  leadsReprocessed: number;
  stagesRun: string[];
  stagesSkippedForBudget: string[];
  runtime?: GrowthPipelineRuntimeSnapshot;
  killed?: boolean;
  backlogPressure?: BacklogPressure;
};

/**
 * High-throughput backlog processor independent of discovery.
 * Stages run in priority order with a shared time budget to avoid gateway timeouts.
 */
export async function runListingBacklogProcessor(
  prisma: PrismaClient,
): Promise<ListingBacklogProcessorResult> {
  const started = Date.now();
  const runtime = await resolveGrowthPipelineRuntimeSnapshot(prisma);
  const stagesRun: string[] = [];
  const stagesSkippedForBudget: string[] = [];

  const emptyVerify = { verified: 0, needsReview: 0, outdated: 0, skipped: 0, noApiKey: false };
  const emptyEnrich = { processed: 0, evidenceStored: 0, promoted: 0, rejected: 0, skipped: 0 };
  const emptyMine = {
    scanned: 0,
    mined: 0,
    highOfficial: 0,
    failed: 0,
    byFailureReason: {} as Record<string, number>,
  };
  const emptyScheduleEnrich = { scanned: 0, confirmed: 0, uncertain: 0, skipped: 0 };
  const emptyOutreachEvidence = {
    processed: 0,
    crawled: 0,
    newTierA: 0,
    newTierB: 0,
    manualReview: 0,
    rejected: 0,
    noEvidence: 0,
    rechecksScheduled: 0,
    skippedDue: 0,
    newHighContacts: 0,
    newSendReady: 0,
    placesResolvedForSend: 0,
    skippedForBudget: false,
  };

  if (micstagePromotionKillSwitch()) {
    return {
      published: 0,
      publishSkipped: 0,
      rejectedFromBacklog: 0,
      rejectReasons: {},
      publishBacklogRemaining: 0,
      googleVerify: emptyVerify,
      promoted: 0,
      junkRejected: 0,
      junkByReason: {},
      evidenceEnrich: emptyEnrich,
      outreachEvidenceEnrich: emptyOutreachEvidence,
      scheduleEnrich: emptyScheduleEnrich,
      contactMine: emptyMine,
      leadsReprocessed: 0,
      stagesRun,
      stagesSkippedForBudget: ["all"],
      runtime,
      killed: true,
      backlogPressure: await evaluateBacklogPressure(prisma),
    };
  }

  const remaining = () => TICK_BUDGET_MS - (Date.now() - started);
  const canRun = (needMs: number) => remaining() > needMs;
  const pressure = await evaluateBacklogPressure(prisma);
  /** Independent of discovery — never shrink publish because the raw reservoir is large. */
  const limits = independentProcessingBudgets(runtime);

  let junk = { scanned: 0, rejected: 0, byReason: {} as Record<string, number> };
  if (canRun(3_000)) {
    junk = await autoRejectJunkListings(prisma, {
      limit: limits.junk,
    });
    stagesRun.push("auto_reject_junk");
  } else {
    stagesSkippedForBudget.push("auto_reject_junk");
  }

  let publish = {
    published: 0,
    skipped: 0,
    rejectedFromBacklog: 0,
    rejectReasons: {} as Record<string, number>,
    backlogRemaining: 0,
  };
  if (canRun(8_000)) {
    const pub = await autoPublishGrowthLeadsAsListings(prisma, {
      publishLimit: limits.publish,
      enrichLimit: Math.min(15, Math.floor(limits.publish / 4)),
      skipDownstream: true,
    });
    publish = {
      published: pub.published,
      skipped: pub.skipped,
      rejectedFromBacklog: pub.rejectedFromBacklog,
      rejectReasons: pub.rejectReasons,
      backlogRemaining: pub.backlogRemaining,
    };
    stagesRun.push("publish");
  } else {
    stagesSkippedForBudget.push("publish");
  }

  let googleVerify = emptyVerify;
  if (canRun(10_000)) {
    googleVerify = await verifyPublicListingsWithGoogle(prisma, {
      limit: limits.googleVerify,
    });
    stagesRun.push("google_verify");
  } else {
    stagesSkippedForBudget.push("google_verify");
  }

  let promote = { promoted: 0 };
  if (canRun(5_000)) {
    promote = await promotePlaceConfirmedListings(prisma, {
      limit: limits.promote,
    });
    stagesRun.push("promote");
  } else {
    stagesSkippedForBudget.push("promote");
  }

  let evidenceEnrich = emptyEnrich;
  if (canRun(12_000)) {
    evidenceEnrich = await enrichListingsMissingTrustedEvidence(prisma, {
      limit: limits.evidence,
    });
    stagesRun.push("evidence_enrich");
  } else {
    stagesSkippedForBudget.push("evidence_enrich");
  }

  let scheduleEnrich = emptyScheduleEnrich;
  if (canRun(10_000)) {
    scheduleEnrich = await enrichVerifiedListingSchedules(prisma, { limit: limits.schedule });
    stagesRun.push("schedule_enrich");
  } else {
    stagesSkippedForBudget.push("schedule_enrich");
  }

  let outreachEvidenceEnrich = emptyOutreachEvidence;
  if (canRun(12_000)) {
    outreachEvidenceEnrich = await enrichGrowthLeadOfficialEvidence(prisma, {
      limit: runtime.outreachEvidenceEnrichPerTick.effective,
      budgetMs: Math.max(1_000, Math.min(14_000, remaining() - 2_000)),
    });
    stagesRun.push("outreach_evidence_enrich");
  } else {
    stagesSkippedForBudget.push("outreach_evidence_enrich");
  }

  let contactMine = emptyMine;
  if (canRun(12_000)) {
    contactMine = await mineVerifiedListingOfficialEmails(prisma, {
      limit: limits.mine,
    });
    stagesRun.push("contact_mine");
  } else {
    stagesSkippedForBudget.push("contact_mine");
  }

  let leadsReprocessed = 0;
  if (canRun(2_000)) {
    leadsReprocessed = await reprocessOldLeadsCursor(prisma, limits.leadReprocess);
    stagesRun.push("lead_reprocess");
  } else {
    stagesSkippedForBudget.push("lead_reprocess");
  }

  return {
    published: publish.published,
    publishSkipped: publish.skipped,
    rejectedFromBacklog: publish.rejectedFromBacklog,
    rejectReasons: publish.rejectReasons,
    publishBacklogRemaining: publish.backlogRemaining,
    googleVerify,
    promoted: promote.promoted + evidenceEnrich.promoted,
    junkRejected: junk.rejected,
    junkByReason: junk.byReason,
    evidenceEnrich,
    outreachEvidenceEnrich,
    scheduleEnrich,
    contactMine,
    leadsReprocessed,
    stagesRun,
    stagesSkippedForBudget,
    runtime,
    backlogPressure: pressure,
  };
}

async function reprocessOldLeadsCursor(prisma: PrismaClient, limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const cursorRaw = await readDiscoveryCursor(prisma, BACKLOG_ADAPTER, BACKLOG_MARKET, REPROCESS_CURSOR_KEY);
  const after = cursorRaw ? new Date(cursorRaw) : new Date(0);

  const leads = await prisma.growthLead.findMany({
    where: {
      leadType: "VENUE",
      status: { notIn: ["REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
      openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
      NOT: { publicListings: { some: {} } },
      updatedAt: { gt: after },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true, updatedAt: true },
  });

  if (leads.length === 0) {
    await writeDiscoveryCursor(prisma, BACKLOG_ADAPTER, BACKLOG_MARKET, REPROCESS_CURSOR_KEY, new Date(0).toISOString());
    return 0;
  }

  for (const lead of leads) {
    await prisma.growthLead.update({
      where: { id: lead.id },
      data: { status: "DISCOVERED" },
    });
  }

  const last = leads[leads.length - 1]!;
  await writeDiscoveryCursor(
    prisma,
    BACKLOG_ADAPTER,
    BACKLOG_MARKET,
    REPROCESS_CURSOR_KEY,
    last.updatedAt.toISOString(),
  );
  return leads.length;
}
