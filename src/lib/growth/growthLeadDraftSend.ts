import type { PrismaClient } from "@/generated/prisma/client";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { explainGrowthLeadOutreachBlock } from "@/lib/growth/growthLeadBlock";
import { marketingTemplateKindForGrowthLeadType } from "@/lib/growth/templateKindForLead";
import { venueLeadMailboxForOutreach } from "@/lib/growth/leadEmailValidation";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { isOnlyTransientMarketingThrottle } from "@/lib/marketing/sendCaps";
import { sendThroughMarketingPipeline, type MarketingSendResult } from "@/lib/marketing/sendPipeline";

/**
 * Sends an outreach draft. APPROVED sends normally; PENDING_REVIEW sends only when the lead’s launch market
 * has `coldApprovalRelaxed` (still explicit admin click — no auto-send).
 */
export async function sendGrowthLeadOutreachDraft(
  prisma: PrismaClient,
  draftId: string,
  opts?: { actorEmail?: string | null; allowLowConfidenceEmail?: boolean },
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
    if (slug) {
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
    }
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByEmail: opts?.actorEmail?.trim() || (slug ? "relaxed-market" : "no-market-slug"),
      },
    });
  }

  return sendApprovedGrowthLeadDraft(prisma, draftId, {
    allowLowConfidenceEmail: opts?.allowLowConfidenceEmail === true,
  });
}

export async function sendApprovedGrowthLeadDraft(
  prisma: PrismaClient,
  draftId: string,
  opts?: { allowLowConfidenceEmail?: boolean },
): Promise<MarketingSendResult> {
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

  const bypassConfidence = opts?.allowLowConfidenceEmail === true;
  const allowMediumOutreach = process.env.GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE === "true";
  if (!bypassConfidence) {
    const conf = draft.lead.contactEmailConfidence;
    if (conf === "LOW") {
      return { ok: false, blocked: true, reasons: ["LOW confidence email — blocked for automated sends"] };
    }
    if (conf === "MEDIUM" && !allowMediumOutreach) {
      return {
        ok: false,
        blocked: true,
        reasons: [
          "MEDIUM confidence — blocked for production outreach (HIGH only). Set GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE=true to allow MEDIUM, or use an admin send override.",
        ],
      };
    }
  }

  let email: string;
  if (draft.lead.leadType === "VENUE") {
    const mb = venueLeadMailboxForOutreach(draft.toEmailNormalized, draft.lead.contactEmailConfidence);
    if (!mb.ok) {
      const detail =
        mb.reason === "low_confidence_or_ineligible"
          ? "LOW confidence email — blocked for automated sends"
          : `Invalid or non-mailable venue recipient (${mb.reason})`;
      return { ok: false, blocked: true, reasons: [detail] };
    }
    email = mb.normalized;
  } else {
    const n = normalizeMarketingEmail(draft.toEmailNormalized);
    if (!n) {
      return { ok: false, blocked: true, reasons: ["Invalid draft recipient email"] };
    }
    email = n;
  }

  const contact = await prisma.marketingContact.findUnique({ where: { emailNormalized: email } });
  const block = await explainGrowthLeadOutreachBlock(prisma, {
    leadStatus: draft.lead.status,
    toEmail: email,
    contact,
    discoveryMarketSlug: draft.discoveryMarketSlug ?? draft.lead.discoveryMarketSlug,
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
    if (draft.lead.leadType === "VENUE") {
      await advanceGrowthLeadAcquisitionStage(prisma, draft.leadId, "OUTREACH_SENT", { leadType: "VENUE" });
    }
  } else if (!isOnlyTransientMarketingThrottle(result.reasons)) {
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: { lastError: result.reasons.join(" | ").slice(0, 2000) },
    });
  }

  return result;
}
