import type { PrismaClient } from "@/generated/prisma/client";

export type GrowthMarketMetrics = {
  marketSlug: string;
  funnel: {
    discoveredOrReview: number;
    approved: number;
    contacted: number;
    replied: number;
    joined: number;
  };
  outcomes: {
    bounced: number;
    unsubscribed: number;
    rejected: number;
  };
  outreach: {
    sends: number;
  };
  /** EMAIL-channel response rows logged for leads in this market. */
  replyLogsEmail: number;
};

function marketMatch(slug: string) {
  return { equals: slug.trim(), mode: "insensitive" as const };
}

/**
 * Aggregates for one discovery market: funnel stages, outcomes, and sent growth-lead drafts.
 */
export async function loadGrowthMarketMetrics(prisma: PrismaClient, marketSlug: string): Promise<GrowthMarketMetrics> {
  const slug = marketSlug.trim();
  const leadMarket = { discoveryMarketSlug: marketMatch(slug) };

  const [
    discoveredOrReview,
    approved,
    contacted,
    replied,
    joined,
    bounced,
    unsubscribed,
    rejected,
    sends,
    replyLogsEmail,
  ] = await Promise.all([
    prisma.growthLead.count({
      where: { ...leadMarket, status: { in: ["DISCOVERED", "REVIEWED"] } },
    }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "APPROVED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "CONTACTED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "REPLIED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "JOINED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "BOUNCED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "UNSUBSCRIBED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "REJECTED" } }),
    prisma.growthLeadOutreachDraft.count({
      where: {
        status: "SENT",
        OR: [{ discoveryMarketSlug: marketMatch(slug) }, { lead: leadMarket }],
      },
    }),
    prisma.growthLeadResponse.count({
      where: {
        channel: "EMAIL",
        lead: leadMarket,
      },
    }),
  ]);

  return {
    marketSlug: slug,
    funnel: {
      discoveredOrReview,
      approved,
      contacted,
      replied,
      joined,
    },
    outcomes: {
      bounced,
      unsubscribed,
      rejected,
    },
    outreach: { sends },
    replyLogsEmail,
  };
}
