import type { PrismaClient } from "@/generated/prisma/client";
import { MarketingContactStatus } from "@/generated/prisma/client";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { buildGrowthLeadOutreachPayload } from "@/lib/growth/outreachEmailBodies";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

/**
 * Creates a single PENDING_REVIEW growth outreach draft when the lead has email
 * and does not already have an open cold draft (pending, approved, or sent).
 */
export async function createPendingGrowthLeadOutreachDraft(
  prisma: PrismaClient,
  leadId: string,
): Promise<{ ok: true; draftId: string } | { ok: false; reason: string }> {
  const lead = await prisma.growthLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "Lead not found" };

  const email = lead.contactEmailNormalized ? normalizeMarketingEmail(lead.contactEmailNormalized) : null;
  if (!email) return { ok: false, reason: "Lead has no contact email" };

  const existing = await prisma.growthLeadOutreachDraft.findFirst({
    where: {
      leadId,
      status: { in: ["PENDING_REVIEW", "APPROVED", "SENT"] },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "Lead already has an active or sent outreach draft" };

  const payload = buildGrowthLeadOutreachPayload({
    leadType: lead.leadType,
    name: lead.name,
    city: lead.city,
    discoveryMarketSlug: lead.discoveryMarketSlug,
    contactUrl: lead.contactUrl,
    websiteUrl: lead.websiteUrl,
    leadId: lead.id,
  });

  const contact = await prisma.marketingContact.upsert({
    where: { emailNormalized: email },
    create: {
      emailNormalized: email,
      displayName: lead.name,
      discoveryMarketSlug: lead.discoveryMarketSlug ?? undefined,
      source: "growth-lead",
      status: MarketingContactStatus.ACTIVE,
    },
    update: {
      displayName: lead.name,
      discoveryMarketSlug: lead.discoveryMarketSlug ?? undefined,
    },
  });

  const draft = await prisma.growthLeadOutreachDraft.create({
    data: {
      leadId: lead.id,
      contactId: contact.id,
      toEmailNormalized: email,
      status: "PENDING_REVIEW",
      subject: payload.subject,
      textBody: payload.textBody,
      htmlBody: payload.htmlBody,
      discoveryMarketSlug: lead.discoveryMarketSlug,
    },
  });

  if (lead.leadType === "VENUE") {
    await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "OUTREACH_DRAFTED", { leadType: "VENUE" });
  }

  return { ok: true, draftId: draft.id };
}
