import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import {
  classifyAuthoritativeCorrectionReply,
  type AuthoritativeReplyClassification,
} from "@/lib/marketing/authoritativeReplyClassifier";
import {
  applyAuthoritativeListingRemoval,
  flagListingForReverification,
} from "@/lib/publicListings/authoritativeListingRemoval";

export type InboundCorrectionSource = "resend_inbound" | "support_note" | "growth_response";

export type IngestInboundCorrectionResult = {
  classification: AuthoritativeReplyClassification;
  firstParty: boolean;
  listingIds: string[];
  leadIds: string[];
  action:
    | "removed"
    | "flagged_reverify"
    | "suppressed_unsubscribe"
    | "flagged_review"
    | "logged_only"
    | "ignored";
  note: string;
};

function excerpt(text: string, max = 800): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

async function findAssociatedListingsAndLeads(
  prisma: PrismaClient,
  fromEmail: string,
): Promise<{ listingIds: string[]; leadIds: string[]; emails: string[] }> {
  const listings = await prisma.publicOpenMicListing.findMany({
    where: {
      OR: [
        { claimInviteEmail: fromEmail },
        { growthLead: { contactEmailNormalized: fromEmail } },
      ],
    },
    select: { id: true, growthLeadId: true },
    take: 20,
  });

  const leads = await prisma.growthLead.findMany({
    where: { contactEmailNormalized: fromEmail },
    select: { id: true },
    take: 20,
  });

  const listingIds = [...new Set(listings.map((l) => l.id))];
  const leadIds = [
    ...new Set([...leads.map((l) => l.id), ...listings.map((l) => l.growthLeadId).filter(Boolean)]),
  ] as string[];

  return { listingIds, leadIds, emails: [fromEmail] };
}

async function logLeadResponses(
  prisma: PrismaClient,
  leadIds: string[],
  summary: string,
  meta: Prisma.InputJsonValue,
): Promise<void> {
  for (const leadId of leadIds) {
    await prisma.growthLeadResponse.create({
      data: {
        leadId,
        channel: "EMAIL",
        summary,
        meta,
      },
    });
  }
}

/**
 * Capture an official inbox reply, associate it to the matching lead/listing,
 * and apply high-confidence first-party corrections. Never invents replacement data.
 */
export async function ingestInboundCorrectionReply(
  prisma: PrismaClient,
  input: {
    fromEmail: string;
    subject?: string | null;
    text?: string | null;
    providerMessageId?: string | null;
    source: InboundCorrectionSource;
  },
): Promise<IngestInboundCorrectionResult> {
  const fromEmail = normalizeMarketingEmail(input.fromEmail) ?? "";
  const body = `${input.subject ?? ""}\n${input.text ?? ""}`.trim();
  const classification = classifyAuthoritativeCorrectionReply(body);

  if (!fromEmail) {
    return {
      classification,
      firstParty: false,
      listingIds: [],
      leadIds: [],
      action: "ignored",
      note: "missing_from_email",
    };
  }

  const associated = await findAssociatedListingsAndLeads(prisma, fromEmail);
  const firstParty = associated.listingIds.length > 0 || associated.leadIds.length > 0;
  const summary = excerpt(
    `[${input.source}] ${classification.intent}: ${input.subject ?? ""} ${input.text ?? ""}`,
  );
  const meta = {
    source: input.source,
    intent: classification.intent,
    matchedPhrases: classification.matchedPhrases,
    providerMessageId: input.providerMessageId ?? null,
    subject: input.subject ?? null,
  } as Prisma.InputJsonValue;

  if (associated.leadIds.length > 0) {
    await logLeadResponses(prisma, associated.leadIds, summary, meta);
  }

  await prisma.marketingEvent.create({
    data: {
      type: "INTERNAL_AUDIT",
      payload: {
        kind: "inbound_correction_reply",
        fromMatched: firstParty,
        listingIds: associated.listingIds,
        leadIds: associated.leadIds,
        intent: classification.intent,
        source: input.source,
      } as Prisma.InputJsonValue,
    },
  });

  if (!firstParty) {
    return {
      classification,
      firstParty: false,
      listingIds: [],
      leadIds: [],
      action: classification.intent === "none" ? "ignored" : "flagged_review",
      note: "no_first_party_association",
    };
  }

  const note = `Inbound ${classification.intent} (${classification.matchedPhrases.join(", ") || "n/a"}) via ${input.source}`;

  if (classification.intent === "high_confidence_removal" && associated.listingIds.length === 1) {
    await applyAuthoritativeListingRemoval({
      prisma,
      listingId: associated.listingIds[0],
      actorLabel: "inbound-reply",
      contactEmails: associated.emails,
      note,
    });
    return {
      classification,
      firstParty,
      listingIds: associated.listingIds,
      leadIds: associated.leadIds,
      action: "removed",
      note,
    };
  }

  if (classification.intent === "high_confidence_removal" && associated.listingIds.length > 1) {
    for (const listingId of associated.listingIds) {
      await flagListingForReverification({
        prisma,
        listingId,
        note: `${note} — multiple listings; review before delete`,
        contactEmails: associated.emails,
      });
    }
    return {
      classification,
      firstParty,
      listingIds: associated.listingIds,
      leadIds: associated.leadIds,
      action: "flagged_review",
      note: "multiple_listings_no_auto_delete",
    };
  }

  if (classification.intent === "high_confidence_reverify") {
    for (const listingId of associated.listingIds) {
      await flagListingForReverification({
        prisma,
        listingId,
        note,
        contactEmails: associated.emails,
      });
    }
    return {
      classification,
      firstParty,
      listingIds: associated.listingIds,
      leadIds: associated.leadIds,
      action: associated.listingIds.length > 0 ? "flagged_reverify" : "suppressed_unsubscribe",
      note,
    };
  }

  if (classification.intent === "unsubscribe") {
    await prisma.marketingEmailSuppression.upsert({
      where: { emailNormalized: fromEmail },
      create: { emailNormalized: fromEmail, reason: "UNSUBSCRIBE", sourceNote: note },
      update: { reason: "UNSUBSCRIBE", sourceNote: note },
    });
    await prisma.growthLead.updateMany({
      where: { contactEmailNormalized: fromEmail },
      data: { status: "UNSUBSCRIBED" },
    });
    await prisma.marketingContact.updateMany({
      where: { emailNormalized: fromEmail },
      data: {
        status: "UNSUBSCRIBED",
        marketingUnsubscribedAt: new Date(),
        suppressedAt: new Date(),
        suppressionReason: "UNSUBSCRIBE",
      },
    });
    await prisma.growthLeadFollowUpSchedule.updateMany({
      where: { lead: { contactEmailNormalized: fromEmail } },
      data: { enabled: false, status: "CANCELLED" },
    });
    return {
      classification,
      firstParty,
      listingIds: associated.listingIds,
      leadIds: associated.leadIds,
      action: "suppressed_unsubscribe",
      note,
    };
  }

  if (classification.intent === "ambiguous_review") {
    for (const listingId of associated.listingIds) {
      await prisma.listingCorrection.create({
        data: {
          listingId,
          reporterEmail: fromEmail,
          kind: "AMBIGUOUS_INBOUND_REPLY",
          message: excerpt(body, 2000),
          status: "PENDING",
        },
      });
    }
    return {
      classification,
      firstParty,
      listingIds: associated.listingIds,
      leadIds: associated.leadIds,
      action: "flagged_review",
      note,
    };
  }

  return {
    classification,
    firstParty,
    listingIds: associated.listingIds,
    leadIds: associated.leadIds,
    action: "logged_only",
    note: "no_actionable_language",
  };
}
