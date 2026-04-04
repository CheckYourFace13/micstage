import type { PrismaClient } from "@/generated/prisma/client";
import { MARKETING_TEMPLATE_KINDS } from "@/lib/marketing/templateKinds";
import { sendThroughMarketingPipeline, type MarketingSendResult } from "@/lib/marketing/sendPipeline";

export async function sendApprovedOutreachDraft(prisma: PrismaClient, draftId: string): Promise<MarketingSendResult> {
  const draft = await prisma.marketingOutreachDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      status: true,
      toEmailNormalized: true,
      subject: true,
      htmlBody: true,
      textBody: true,
      venueId: true,
      discoveryMarketSlug: true,
    },
  });
  if (!draft) {
    return { ok: false, blocked: true, reasons: ["Draft not found"] };
  }
  if (draft.status !== "APPROVED") {
    return { ok: false, blocked: true, reasons: [`Draft status is ${draft.status}, expected APPROVED`] };
  }

  const purposeKey = `outreach-draft:${draft.id}`;
  const result = await sendThroughMarketingPipeline(prisma, {
    to: draft.toEmailNormalized,
    category: "outreach",
    templateKind: MARKETING_TEMPLATE_KINDS.VENUE_OUTREACH_COLD,
    purposeKey,
    subject: draft.subject,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    venueId: draft.venueId,
    discoveryMarketSlug: draft.discoveryMarketSlug,
  });

  if (result.ok) {
    await prisma.marketingOutreachDraft.update({
      where: { id: draftId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        marketingEmailSendId: result.sendId,
        lastError: null,
      },
    });
  } else {
    await prisma.marketingOutreachDraft.update({
      where: { id: draftId },
      data: { lastError: result.reasons.join(" | ").slice(0, 2000) },
    });
  }

  return result;
}
