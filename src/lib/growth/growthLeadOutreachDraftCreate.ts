import type { PrismaClient } from "@/generated/prisma/client";
import { MarketingContactStatus } from "@/generated/prisma/client";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { buildGrowthLeadOutreachPayload } from "@/lib/growth/outreachEmailBodies";
import { venueLeadMailboxForOutreach } from "@/lib/growth/leadEmailValidation";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { checkContactSendSpacing } from "@/lib/marketing/sendCaps";
import type { GrowthOutreachSequenceStep } from "@/lib/marketing/outreachTemplates";

/**
 * Creates a PENDING_REVIEW growth outreach draft (sequence steps 1–3) when the lead has email,
 * no in-flight draft (pending/approved), and sequence / spacing rules allow the next step.
 */
export async function createPendingGrowthLeadOutreachDraft(
  prisma: PrismaClient,
  leadId: string,
  opts?: { allowLowConfidenceEmail?: boolean },
): Promise<{ ok: true; draftId: string } | { ok: false; reason: string }> {
  const lead = await prisma.growthLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "Lead not found" };

  let email: string | null = null;
  if (lead.leadType === "VENUE") {
    const mb = venueLeadMailboxForOutreach(lead.contactEmailNormalized, lead.contactEmailConfidence);
    if (!mb.ok) {
      return {
        ok: false,
        reason:
          mb.reason === "low_confidence_or_ineligible"
            ? "Lead email is LOW confidence or ineligible (skipped for automation)"
            : `Venue contact email invalid or not safe to mail: ${mb.reason}`,
      };
    }
    email = mb.normalized;
  } else {
    email = lead.contactEmailNormalized ? normalizeMarketingEmail(lead.contactEmailNormalized) : null;
  }
  if (!email) return { ok: false, reason: "Lead has no contact email" };

  if (lead.contactEmailConfidence === "LOW" && !opts?.allowLowConfidenceEmail) {
    return { ok: false, reason: "Lead email is LOW confidence (skipped for automation)" };
  }

  const openDraft = await prisma.growthLeadOutreachDraft.findFirst({
    where: { leadId, status: { in: ["PENDING_REVIEW", "APPROVED"] } },
    select: { id: true },
  });
  if (openDraft) {
    return { ok: false, reason: "Lead already has a pending or approved outreach draft" };
  }

  const sentRows = await prisma.growthLeadOutreachDraft.findMany({
    where: { leadId, status: "SENT" },
    select: { sequenceStep: true },
  });
  const maxSentStep = sentRows.reduce((m, r) => Math.max(m, r.sequenceStep), 0);
  if (maxSentStep >= 3) {
    return { ok: false, reason: "Growth outreach sequence already completed (3 emails sent)" };
  }
  const nextSequenceStep = (maxSentStep + 1) as GrowthOutreachSequenceStep;

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

  if (nextSequenceStep > 1) {
    const spacing = await checkContactSendSpacing(prisma, contact.id, "OUTREACH");
    if (!spacing.ok) {
      return { ok: false, reason: spacing.reason };
    }
  }

  const payload = buildGrowthLeadOutreachPayload({
    leadType: lead.leadType,
    name: lead.name,
    city: lead.city,
    discoveryMarketSlug: lead.discoveryMarketSlug,
    contactUrl: lead.contactUrl,
    websiteUrl: lead.websiteUrl,
    leadId: lead.id,
    sequenceStep: nextSequenceStep,
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
      sequenceStep: nextSequenceStep,
    },
  });

  if (lead.leadType === "VENUE" && nextSequenceStep === 1) {
    await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "OUTREACH_DRAFTED", { leadType: "VENUE" });
  }

  return { ok: true, draftId: draft.id };
}
