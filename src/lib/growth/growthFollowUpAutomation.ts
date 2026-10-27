/**
 * One conservative follow-up after delivered outreach. Not a sequence.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { marketingTemplateKindForGrowthLeadType } from "@/lib/growth/templateKindForLead";
import { resolveGrowthLeadClickDestination } from "@/lib/growth/outreachClickDestination";
import { sendThroughMarketingPipeline } from "@/lib/marketing/sendPipeline";
import { resolveOutreachRuntimeSnapshot } from "@/lib/growth/outreachRuntimeSettings";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import { venueLeadMailboxForOutreach } from "@/lib/growth/leadEmailValidation";

const MIN_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type GrowthFollowUpResult = {
  scanned: number;
  sent: number;
  skipped: number;
};

export async function runGrowthFollowUpAutomation(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<GrowthFollowUpResult> {
  const limit = Math.min(8, Math.max(0, opts?.limit ?? 4));
  if (limit <= 0) return { scanned: 0, sent: 0, skipped: 0 };

  const now = Date.now();
  const minSentAt = new Date(now - MAX_AGE_MS);
  const maxSentAt = new Date(now - MIN_AGE_MS);

  const drafts = await prisma.growthLeadOutreachDraft.findMany({
    where: {
      status: "SENT",
      sentAt: { gte: minSentAt, lte: maxSentAt },
      lead: {
        status: { notIn: ["REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
        acquisitionStage: { in: ["OUTREACH_SENT", "CLICKED"] },
        accountCreatedAt: null,
        listingLiveAt: null,
        contactEmailNormalized: { not: null },
        contactEmailConfidence: "HIGH",
        publicListings: { none: { claimedVenueId: { not: null } } },
      },
    },
    select: {
      id: true,
      leadId: true,
      discoveryMarketSlug: true,
      lead: {
        select: {
          id: true,
          name: true,
          leadType: true,
          contactEmailNormalized: true,
          acquisitionStage: true,
        },
      },
    },
    orderBy: { sentAt: "asc" },
    take: 40,
  });

  const outreachRuntime = await resolveOutreachRuntimeSnapshot(prisma);
  let sent = 0;
  let skipped = 0;
  let scanned = 0;

  for (const draft of drafts) {
    if (sent >= limit) break;
    scanned += 1;
    const mailbox = venueLeadMailboxForOutreach(draft.lead.contactEmailNormalized, "HIGH");
    if (!mailbox.ok) {
      skipped += 1;
      continue;
    }
    const email = mailbox.normalized;
    if ((await isMarketingEmailSuppressed(prisma, email)).suppressed) {
      skipped += 1;
      continue;
    }
    const priorFollow = await prisma.marketingEmailSend.findFirst({
      where: {
        category: "OUTREACH",
        purposeKey: `growth-lead-followup:${draft.leadId}`,
        status: "SENT",
      },
      select: { id: true },
    });
    if (priorFollow) {
      skipped += 1;
      continue;
    }
    const bounceOrComplaint = await prisma.marketingEmailSend.findFirst({
      where: {
        toEmailNormalized: email,
        OR: [{ bouncedAt: { not: null } }, { complainedAt: { not: null } }],
      },
      select: { id: true },
    });
    if (bounceOrComplaint) {
      skipped += 1;
      continue;
    }
    const originalSend = await prisma.marketingEmailSend.findFirst({
      where: {
        category: "OUTREACH",
        toEmailNormalized: email,
        status: "SENT",
        bouncedAt: null,
        complainedAt: null,
      },
      select: { id: true, deliveredAt: true },
      orderBy: { sentAt: "asc" },
    });
    if (!originalSend) {
      skipped += 1;
      continue;
    }

    const click = await resolveGrowthLeadClickDestination(prisma, draft.leadId);
    const firstName = draft.lead.name.split(/\s+/)[0] || "there";
    const subject = "Quick follow-up from MicStage";
    const textBody = `Hi ${firstName},

Just a short follow-up in case the first note got buried. MicStage is free — no credit card — and you can connect your open mic in under a minute.

${click ?? ""}

Reply stop if you would rather not hear from us.`;
    const htmlBody = `<p>Hi ${firstName},</p><p>Just a short follow-up in case the first note got buried. MicStage is free — no credit card — and you can connect your open mic in under a minute.</p><p><a href="${click ?? "#"}">Continue</a></p>`;

    const result = await sendThroughMarketingPipeline(prisma, {
      to: email,
      category: "outreach",
      templateKind: marketingTemplateKindForGrowthLeadType(
        draft.lead.leadType === "PROMOTER_ACCOUNT" ? "PROMOTER_ACCOUNT" : draft.lead.leadType === "ARTIST" ? "ARTIST" : "VENUE",
      ),
      purposeKey: `growth-lead-followup:${draft.leadId}`,
      subject,
      htmlBody,
      textBody,
      discoveryMarketSlug: draft.discoveryMarketSlug,
      clickDestinationUrl: click,
      domainDailyCapOverride: outreachRuntime.effectiveDomainDailyMax,
      categoryDailyCapOverride: outreachRuntime.effectiveMarketingOutreachDailyCap,
    });
    if (result.ok && !result.duplicate) sent += 1;
    else skipped += 1;
  }

  return { scanned, sent, skipped };
}
