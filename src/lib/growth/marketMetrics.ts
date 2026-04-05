import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export type GrowthFunnelMetrics = {
  marketSlug: string | null;
  discovered: number;
  reviewed: number;
  approved: number;
  /** Leads with at least one draft in PENDING_REVIEW or APPROVED (cold prep, not yet sent). */
  drafted: number;
  contacted: number;
  replied: number;
  joined: number;
  bounced: number;
  unsubscribed: number;
  rejected: number;
  outreachSends: number;
  replyLogsEmail: number;
};

function marketMatch(slug: string) {
  return { equals: slug.trim(), mode: "insensitive" as const };
}

function leadWhereForMarket(slug: string | null): Prisma.GrowthLeadWhereInput {
  if (!slug?.trim()) return {};
  return { discoveryMarketSlug: marketMatch(slug) };
}

/**
 * Full funnel for one market (`slug`) or all markets when `slug` is null/empty.
 */
export async function loadGrowthFunnelMetrics(prisma: PrismaClient, marketSlug: string | null): Promise<GrowthFunnelMetrics> {
  const slug = marketSlug?.trim() || null;
  const leadMarket = leadWhereForMarket(slug);

  const [
    discovered,
    reviewed,
    approved,
    drafted,
    contacted,
    replied,
    joined,
    bounced,
    unsubscribed,
    rejected,
    outreachSends,
    replyLogsEmail,
  ] = await Promise.all([
    prisma.growthLead.count({ where: { ...leadMarket, status: "DISCOVERED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "REVIEWED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "APPROVED" } }),
    prisma.growthLead.count({
      where: {
        ...leadMarket,
        outreachDrafts: { some: { status: { in: ["PENDING_REVIEW", "APPROVED"] } } },
      },
    }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "CONTACTED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "REPLIED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "JOINED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "BOUNCED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "UNSUBSCRIBED" } }),
    prisma.growthLead.count({ where: { ...leadMarket, status: "REJECTED" } }),
    prisma.growthLeadOutreachDraft.count({
      where: slug
        ? {
            status: "SENT",
            OR: [{ discoveryMarketSlug: marketMatch(slug) }, { lead: leadMarket }],
          }
        : { status: "SENT" },
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
    discovered,
    reviewed,
    approved,
    drafted,
    contacted,
    replied,
    joined,
    bounced,
    unsubscribed,
    rejected,
    outreachSends,
    replyLogsEmail,
  };
}

/** @deprecated Prefer loadGrowthFunnelMetrics — kept for expansion health until refactored. */
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
  replyLogsEmail: number;
};

/** @deprecated Use loadGrowthFunnelMetrics; this shape is used by expansionHealth. */
export async function loadGrowthMarketMetrics(prisma: PrismaClient, marketSlug: string): Promise<GrowthMarketMetrics> {
  const f = await loadGrowthFunnelMetrics(prisma, marketSlug);
  return {
    marketSlug: f.marketSlug ?? marketSlug,
    funnel: {
      discoveredOrReview: f.discovered + f.reviewed,
      approved: f.approved,
      contacted: f.contacted,
      replied: f.replied,
      joined: f.joined,
    },
    outcomes: {
      bounced: f.bounced,
      unsubscribed: f.unsubscribed,
      rejected: f.rejected,
    },
    outreach: { sends: f.outreachSends },
    replyLogsEmail: f.replyLogsEmail,
  };
}
