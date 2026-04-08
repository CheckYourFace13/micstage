import type { GrowthLeadAcquisitionStage, GrowthLeadType } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

const ORDER: GrowthLeadAcquisitionStage[] = [
  "DISCOVERED",
  "OUTREACH_DRAFTED",
  "OUTREACH_SENT",
  "CLICKED",
  "SIGNUP_STARTED",
  "ACCOUNT_CREATED",
  "LISTING_LIVE",
];

function stageIndex(s: GrowthLeadAcquisitionStage): number {
  return ORDER.indexOf(s);
}

/**
 * Advances acquisition stage only forward (never downgrades).
 */
export async function advanceGrowthLeadAcquisitionStage(
  prisma: PrismaClient,
  leadId: string,
  target: GrowthLeadAcquisitionStage,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  const lead = await prisma.growthLead.findFirst({
    where: { id: leadId, ...(opts?.leadType ? { leadType: opts.leadType } : {}) },
    select: { acquisitionStage: true },
  });
  if (!lead) return;
  const cur = lead.acquisitionStage;
  if (stageIndex(target) <= stageIndex(cur)) return;
  await prisma.growthLead.update({
    where: { id: leadId },
    data: { acquisitionStage: target },
  });
}
