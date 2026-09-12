import type { GrowthLeadType, PrismaClient } from "@/generated/prisma/client";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

/**
 * After a successful registration, advance the matching GrowthLead to ACCOUNT_CREATED.
 * Prefer explicit growthTraceLeadId; fall back to contact-email match so organic/direct
 * signups still get server-side funnel attribution when the inbox was a known lead.
 */
export async function linkRegistrationToGrowthLead(
  prisma: PrismaClient,
  input: {
    leadType: GrowthLeadType;
    growthTraceLeadId?: string | null;
    registrationEmail: string;
  },
): Promise<{ linkedLeadId: string | null; via: "trace" | "email" | null }> {
  const regEmail = normalizeMarketingEmail(input.registrationEmail);
  if (!regEmail) return { linkedLeadId: null, via: null };

  let lead: { id: string; contactEmailNormalized: string | null } | null = null;
  let via: "trace" | "email" | null = null;

  if (input.growthTraceLeadId) {
    lead = await prisma.growthLead.findFirst({
      where: { id: input.growthTraceLeadId, leadType: input.leadType },
      select: { id: true, contactEmailNormalized: true },
    });
    if (lead) via = "trace";
  }

  if (!lead) {
    lead = await prisma.growthLead.findFirst({
      where: {
        leadType: input.leadType,
        contactEmailNormalized: regEmail,
        acquisitionStage: {
          in: ["DISCOVERED", "OUTREACH_DRAFTED", "OUTREACH_SENT", "CLICKED", "SIGNUP_STARTED"],
        },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, contactEmailNormalized: true },
    });
    if (lead) via = "email";
  }

  if (!lead) return { linkedLeadId: null, via: null };

  await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "ACCOUNT_CREATED", {
    leadType: input.leadType,
  });

  const leadEmail = lead.contactEmailNormalized
    ? normalizeMarketingEmail(lead.contactEmailNormalized)
    : null;
  if (leadEmail && leadEmail === regEmail) {
    await prisma.growthLead.update({
      where: { id: lead.id },
      data: { status: "JOINED" },
    });
  }

  return { linkedLeadId: lead.id, via };
}
