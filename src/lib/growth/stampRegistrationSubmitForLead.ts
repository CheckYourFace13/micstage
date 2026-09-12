import type { GrowthLeadType, PrismaClient } from "@/generated/prisma/client";
import {
  isGrowthLeadId,
  stampRegistrationSubmitted,
} from "@/lib/growth/growthLeadAcquisitionStage";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

/**
 * Stamp registrationSubmittedAt for the attributed lead on genuine form POST receipt.
 * Call after email (+ optional growthTraceLeadId) parse, BEFORE consent / rate-limit /
 * duplicate / create outcomes. Prefer explicit growthTraceLeadId; fall back to email match.
 * Never throws — registration must proceed even if stamping fails.
 */
export async function stampRegistrationSubmitForLead(
  prisma: PrismaClient,
  input: {
    leadType: GrowthLeadType;
    growthTraceLeadId?: string | null;
    registrationEmail: string;
  },
): Promise<void> {
  try {
    const regEmail = normalizeMarketingEmail(input.registrationEmail);
    let leadId: string | null = null;

    if (input.growthTraceLeadId && isGrowthLeadId(input.growthTraceLeadId)) {
      const lead = await prisma.growthLead.findFirst({
        where: { id: input.growthTraceLeadId.trim(), leadType: input.leadType },
        select: { id: true },
      });
      if (lead) leadId = lead.id;
    }

    if (!leadId && regEmail) {
      const lead = await prisma.growthLead.findFirst({
        where: {
          leadType: input.leadType,
          contactEmailNormalized: regEmail,
          acquisitionStage: {
            in: ["DISCOVERED", "OUTREACH_DRAFTED", "OUTREACH_SENT", "CLICKED", "SIGNUP_STARTED"],
          },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (lead) leadId = lead.id;
    }

    if (!leadId) return;
    await stampRegistrationSubmitted(prisma, leadId, { leadType: input.leadType });
  } catch (e) {
    console.error("[stampRegistrationSubmitForLead]", e instanceof Error ? e.message : e);
  }
}
