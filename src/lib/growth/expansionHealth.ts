import type { PrismaClient } from "@/generated/prisma/client";
import {
  growthAutoExpansionCronEnabled,
  loadExpansionThresholdsFromEnv,
  type ExpansionThresholds,
} from "@/lib/growth/expansionConfig";
import { loadGrowthMarketMetrics } from "@/lib/growth/marketMetrics";

export type MarketHealthSnapshot = {
  discoveryMarketSlug: string;
  approvedLeads: number;
  sentEmails: number;
  replies: number;
  joinedConversions: number;
  bounceRate: number;
  unsubscribeRate: number;
  touchedDenominator: number;
};

/** Global placeholder until webhooks are correlated per market. */
export async function countGlobalComplaintLikeWebhookSignals(
  prisma: PrismaClient,
  sinceDays = 90,
): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 864e5);
  return prisma.marketingProviderWebhookEvent.count({
    where: {
      createdAt: { gte: since },
      OR: [
        { eventType: { contains: "complaint", mode: "insensitive" } },
        { eventType: { contains: "spam", mode: "insensitive" } },
      ],
    },
  });
}

export async function loadMarketHealthForExpansion(
  prisma: PrismaClient,
  marketSlug: string,
): Promise<MarketHealthSnapshot> {
  const m = await loadGrowthMarketMetrics(prisma, marketSlug);
  const touched =
    m.funnel.contacted + m.funnel.replied + m.funnel.joined + m.outcomes.bounced + m.outcomes.unsubscribed;
  const bounceRate = touched > 0 ? m.outcomes.bounced / touched : 0;
  const unsubscribeRate = touched > 0 ? m.outcomes.unsubscribed / touched : 0;
  const replies = Math.max(m.funnel.replied, m.replyLogsEmail);
  return {
    discoveryMarketSlug: m.marketSlug,
    approvedLeads: m.funnel.approved,
    sentEmails: m.outreach.sends,
    replies,
    joinedConversions: m.funnel.joined,
    bounceRate,
    unsubscribeRate,
    touchedDenominator: touched,
  };
}

export type ExpansionGateResult = { ok: true } | { ok: false; reasons: string[] };

export async function marketMeetsExpansionThresholds(
  prisma: PrismaClient,
  discoveryMarketSlug: string,
  thresholds: ExpansionThresholds,
  globalComplaintSignals: number,
): Promise<ExpansionGateResult> {
  const h = await loadMarketHealthForExpansion(prisma, discoveryMarketSlug);
  const reasons: string[] = [];
  if (h.approvedLeads < thresholds.minApprovedLeads) {
    reasons.push(`approvedLeads ${h.approvedLeads}/${thresholds.minApprovedLeads}`);
  }
  if (h.sentEmails < thresholds.minSentEmails) {
    reasons.push(`sentEmails ${h.sentEmails}/${thresholds.minSentEmails}`);
  }
  if (h.replies < thresholds.minReplies) {
    reasons.push(`replies ${h.replies}/${thresholds.minReplies}`);
  }
  if (h.joinedConversions < thresholds.minJoinedConversions) {
    reasons.push(`joined ${h.joinedConversions}/${thresholds.minJoinedConversions}`);
  }
  if (h.bounceRate > thresholds.maxBounceRate) {
    reasons.push(
      `bounceRate ${(h.bounceRate * 100).toFixed(2)}% > ${(thresholds.maxBounceRate * 100).toFixed(2)}%`,
    );
  }
  if (h.unsubscribeRate > thresholds.maxUnsubscribeRate) {
    reasons.push(
      `unsubscribeRate ${(h.unsubscribeRate * 100).toFixed(2)}% > ${(thresholds.maxUnsubscribeRate * 100).toFixed(2)}%`,
    );
  }
  if (globalComplaintSignals > thresholds.maxComplaintSignalsGlobal) {
    reasons.push(
      `globalComplaintSignals ${globalComplaintSignals}/${thresholds.maxComplaintSignalsGlobal} (webhook placeholder)`,
    );
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export type ActivateNextMarketResult =
  | { didActivate: false; message: string }
  | { didActivate: true; activatedSlug: string; label: string };

/**
 * Walks launch rows in `sortOrder`. When row i is ACTIVE with auto-expansion on and row i+1 is QUEUED,
 * promotes i+1 only if row i’s market passes health thresholds and global complaint cap.
 * At most one promotion per call.
 */
export async function evaluateAndActivateNextQueuedMarket(
  prisma: PrismaClient,
  opts?: { bypassCronEnvGate?: boolean },
): Promise<ActivateNextMarketResult> {
  if (!opts?.bypassCronEnvGate && !growthAutoExpansionCronEnabled()) {
    return { didActivate: false, message: "GROWTH_AUTO_EXPANSION_ENABLED is not true" };
  }

  const thresholds = loadExpansionThresholdsFromEnv();
  const globalComplaints = await countGlobalComplaintLikeWebhookSignals(prisma);
  if (globalComplaints > thresholds.maxComplaintSignalsGlobal) {
    return {
      didActivate: false,
      message: `Global complaint-like webhook signals (${globalComplaints}) exceed GROWTH_EXPANSION_MAX_COMPLAINT_SIGNALS`,
    };
  }

  const ordered = await prisma.growthLaunchMarket.findMany({ orderBy: { sortOrder: "asc" } });
  for (let i = 0; i < ordered.length - 1; i++) {
    const prev = ordered[i];
    const next = ordered[i + 1];
    if (prev.status !== "ACTIVE" || !prev.autoExpansionEnabled) continue;
    if (next.status !== "QUEUED") continue;

    const gate = await marketMeetsExpansionThresholds(
      prisma,
      prev.discoveryMarketSlug,
      thresholds,
      globalComplaints,
    );
    if (!gate.ok) continue;

    await prisma.growthLaunchMarket.update({
      where: { id: next.id },
      data: { status: "ACTIVE", activatedAt: new Date(), pausedAt: null },
    });
    return { didActivate: true, activatedSlug: next.discoveryMarketSlug, label: next.label };
  }

  return {
    didActivate: false,
    message: "No consecutive ACTIVE→QUEUED pair passed gating (or preceding market not healthy yet)",
  };
}
