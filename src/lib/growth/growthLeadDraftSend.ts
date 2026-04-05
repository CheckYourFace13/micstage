import type { PrismaClient } from "@/generated/prisma/client";
import { explainGrowthLeadOutreachBlock } from "@/lib/growth/growthLeadBlock";
import { marketingTemplateKindForGrowthLeadType } from "@/lib/growth/templateKindForLead";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { sendThroughMarketingPipeline, type MarketingSendResult } from "@/lib/marketing/sendPipeline";

/**
 * Sends an outreach draft. APPROVED sends normally; PENDING_REVIEW sends only when the lead’s launch market
 * has `coldApprovalRelaxed` (still explicit admin click — no auto-send).
 */
export async function sendGrowthLeadOutreachDraft(
  prisma: PrismaClient,
  draftId: string,
  opts?: { actorEmail?: string | null },
): Promise<MarketingSendResult> {
  const draft = await prisma.growthLeadOutreachDraft.findUnique({
    where: { id: draftId },
    include: { lead: true },
  });
  if (!draft) {
    return { ok: false, blocked: true, reasons: ["Draft not found"] };
  }

  if (draft.status === "PENDING_REVIEW") {
    const slug = (draft.lead.discoveryMarketSlug ?? draft.discoveryMarketSlug ?? "").trim();
    if (!slug) {
      return { ok: false, blocked: true, reasons: ["Lead has no discovery market slug"] };
    }
    const launch = await prisma.growthLaunchMarket.findFirst({
      where: { discoveryMarketSlug: { equals: slug, mode: "insensitive" } },
    });
    if (!launch?.coldApprovalRelaxed) {
      return {
        ok: false,
        blocked: true,
        reasons: [
          "Cold outreach requires approval for this market. Approve the draft first, or enable “Relax cold approval” on Launch markets.",
        ],
      };
    }
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByEmail: opts?.actorEmail?.trim() || "relaxed-market",
      },
    });
  }

  return sendApprovedGrowthLeadDraft(prisma, draftId);
}

export async function sendApprovedGrowthLeadDraft(prisma: PrismaClient, draftId: string): Promise<MarketingSendResult> {
  const draft = await prisma.growthLeadOutreachDraft.findUnique({
    where: { id: draftId },
    include: { lead: true },
  });
  if (!draft) {
    return { ok: false, blocked: true, reasons: ["Draft not found"] };
  }
  if (draft.status !== "APPROVED") {
    return { ok: false, blocked: true, reasons: [`Draft status is ${draft.status}, expected APPROVED`] };
  }

  const email = normalizeMarketingEmail(draft.toEmailNormalized);
  if (!email) {
    return { ok: false, blocked: true, reasons: ["Invalid draft recipient email"] };
  }

  const contact = await prisma.marketingContact.findUnique({ where: { emailNormalized: email } });
  const block = await explainGrowthLeadOutreachBlock(prisma, {
    leadStatus: draft.lead.status,
    toEmail: email,
    contact,
  });
  if (block.blocked) {
    return { ok: false, blocked: true, reasons: block.reasons };
  }

  const templateKind = marketingTemplateKindForGrowthLeadType(draft.lead.leadType);
  const purposeKey = `growth-lead-draft:${draft.id}`;

  const result = await sendThroughMarketingPipeline(prisma, {
    to: email,
    category: "outreach",
    templateKind,
    purposeKey,
    subject: draft.subject,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    venueId: null,
    discoveryMarketSlug: draft.discoveryMarketSlug ?? draft.lead.discoveryMarketSlug,
  });

  if (result.ok) {
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        marketingEmailSendId: result.sendId,
        lastError: null,
      },
    });
    await prisma.growthLead.update({
      where: { id: draft.leadId },
      data: {
        status: "CONTACTED",
      },
    });
  } else {
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: { lastError: result.reasons.join(" | ").slice(0, 2000) },
    });
  }

  return result;
}
