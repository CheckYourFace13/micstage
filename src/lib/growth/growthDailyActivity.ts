import type { PrismaClient } from "@/generated/prisma/client";

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export type GrowthDailyActivityStats = {
  since: string;
  leadsDiscovered: number;
  /** Leads moved to APPROVED today (updatedAt heuristic — see UI note). */
  leadsApprovedHeuristic: number;
  draftsGenerated: number;
  growthSendsCompleted: number;
  outreachBlockedSends: number;
};

export async function loadGrowthDailyActivityStats(prisma: PrismaClient, now = new Date()): Promise<GrowthDailyActivityStats> {
  const since = startOfUtcDay(now);

  const [
    leadsDiscovered,
    leadsApprovedHeuristic,
    draftsGenerated,
    growthSendsCompleted,
    outreachBlockedSends,
  ] = await Promise.all([
    prisma.growthLead.count({ where: { createdAt: { gte: since } } }),
    prisma.growthLead.count({
      where: { status: "APPROVED", updatedAt: { gte: since } },
    }),
    prisma.growthLeadOutreachDraft.count({ where: { createdAt: { gte: since } } }),
    prisma.growthLeadOutreachDraft.count({
      where: { status: "SENT", sentAt: { gte: since } },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "BLOCKED",
        createdAt: { gte: since },
      },
    }),
  ]);

  return {
    since: since.toISOString(),
    leadsDiscovered,
    leadsApprovedHeuristic,
    draftsGenerated,
    growthSendsCompleted,
    outreachBlockedSends,
  };
}
