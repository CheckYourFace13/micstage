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
 * First-touch milestone timestamps (signupStartedAt / accountCreatedAt / listingLiveAt) are set once.
 */
export async function advanceGrowthLeadAcquisitionStage(
  prisma: PrismaClient,
  leadId: string,
  target: GrowthLeadAcquisitionStage,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  const lead = await prisma.growthLead.findFirst({
    where: { id: leadId, ...(opts?.leadType ? { leadType: opts.leadType } : {}) },
    select: {
      acquisitionStage: true,
      signupStartedAt: true,
      accountCreatedAt: true,
      listingLiveAt: true,
    },
  });
  if (!lead) return;
  const cur = lead.acquisitionStage;
  if (stageIndex(target) <= stageIndex(cur)) return;

  const now = new Date();
  const data: {
    acquisitionStage: GrowthLeadAcquisitionStage;
    signupStartedAt?: Date;
    accountCreatedAt?: Date;
    listingLiveAt?: Date;
  } = { acquisitionStage: target };

  // Stamp milestones for any stage jump that crosses them (e.g. CLICKED → ACCOUNT_CREATED).
  if (stageIndex(target) >= stageIndex("SIGNUP_STARTED") && !lead.signupStartedAt) {
    data.signupStartedAt = now;
  }
  if (stageIndex(target) >= stageIndex("ACCOUNT_CREATED") && !lead.accountCreatedAt) {
    data.accountCreatedAt = now;
  }
  if (stageIndex(target) >= stageIndex("LISTING_LIVE") && !lead.listingLiveAt) {
    data.listingLiveAt = now;
  }

  await prisma.growthLead.update({
    where: { id: leadId },
    data,
  });
}
