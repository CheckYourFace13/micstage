/**
 * Centralized general marketing outreach eligibility for GrowthLead records.
 * Claim invitations use a separate, stricter path — never weaken those gates here.
 */
import type {
  GrowthLead,
  GrowthLeadEmailConfidence,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadSourceKind,
  GrowthLeadStatus,
  GrowthLeadType,
  MarketingContact,
  PrismaClient,
} from "@/generated/prisma/client";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

export type OutreachEligibilityReason =
  | "eligible"
  | "missing_email"
  | "not_high_confidence"
  | "wrong_lead_type"
  | "wrong_status"
  | "weak_open_mic_signal"
  | "chamber_tourism"
  | "directory_aggregator"
  | "free_mail_mismatch"
  | "domain_mismatch"
  | "role_mismatch"
  | "lead_status_blocked"
  | "suppressed"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "do_not_contact"
  | "removed_listing"
  | "pending_draft"
  | "already_contacted"
  | "defer_claim_path"
  | "duplicate_recent_send";

const IMPORT_LIKE: GrowthLeadSourceKind[] = [
  "MANUAL_ADMIN",
  "CSV_IMPORT",
  "CLAUDE_CSV",
  "WEBSITE_CONTACT",
  "EVENT_LISTING",
  "SOCIAL_PROFILE",
];

const CHAMBER_TOURISM =
  /\b(chamber|tourism|visitor|visitors|convention|bureau|economic[\s-]?development|destination|welcome[\s-]?center)\b|(?:^|[.@])(chamber|tourism|visitor|convention|bureau)(?:[.@]|$)/i;

const DIRECTORY_AGG =
  /\b(eventbrite|facebook\.com|instagram\.com|yelp\.com|bandsintown|songkick|do512|timeout|thrillist|patch\.com|allevents|meetup\.com)\b/i;

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "msn.com",
  "ymail.com",
]);

const PREFERRED_ROLE_LOCAL = /^(events|booking|info|entertainment|manager|promotions|promo|contact|hello|office|admin|reservations)@/i;

export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function hostFromEmail(email: string): string | null {
  const i = email.lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function isFreeMailHost(host: string | null): boolean {
  if (!host) return false;
  return FREE_MAIL.has(host);
}

function openMicSignalOk(tier: GrowthLeadOpenMicSignalTier | null | undefined, sourceKind: GrowthLeadSourceKind): boolean {
  if (tier === "EXPLICIT_OPEN_MIC" || tier === "STRONG_LIVE_EVENT") return true;
  return IMPORT_LIKE.includes(sourceKind);
}

function statusOk(status: GrowthLeadStatus): boolean {
  return status === "DISCOVERED" || status === "REVIEWED" || status === "APPROVED";
}

function leadTypeOk(type: GrowthLeadType): boolean {
  return type === "VENUE" || type === "PROMOTER_ACCOUNT";
}

function contactStatusReason(contact: MarketingContact | null | undefined): OutreachEligibilityReason | null {
  if (!contact) return null;
  if (contact.status === "UNSUBSCRIBED" || contact.marketingUnsubscribedAt) return "unsubscribed";
  if (contact.status === "BOUNCED") return "bounced";
  if (contact.status === "COMPLAINED") return "complained";
  if (contact.status === "DO_NOT_CONTACT") return "do_not_contact";
  return null;
}

function leadStatusReason(status: GrowthLeadStatus): OutreachEligibilityReason | null {
  if (status === "CONTACTED") return "already_contacted";
  if (status === "JOINED" || status === "UNSUBSCRIBED" || status === "BOUNCED" || status === "REJECTED") {
    return "lead_status_blocked";
  }
  return null;
}

export type GrowthLeadOutreachInput = Pick<
  GrowthLead,
  | "id"
  | "leadType"
  | "status"
  | "name"
  | "contactEmailNormalized"
  | "contactEmailConfidence"
  | "websiteUrl"
  | "contactUrl"
  | "websiteHostNormalized"
  | "openMicSignalTier"
  | "sourceKind"
> & {
  hasPendingDraft?: boolean;
  hasRecentOutreachSend?: boolean;
  deferClaimPath?: boolean;
  listingRemoved?: boolean;
  contact?: MarketingContact | null;
  suppressionBlocked?: boolean;
};

/** Pure eligibility evaluation (no DB). */
export function evaluateGrowthLeadOutreachEligibility(input: GrowthLeadOutreachInput): {
  eligible: boolean;
  reason: OutreachEligibilityReason;
} {
  const email = normalizeMarketingEmail(input.contactEmailNormalized ?? "");
  if (!email) return { eligible: false, reason: "missing_email" };
  if (input.contactEmailConfidence !== "HIGH") return { eligible: false, reason: "not_high_confidence" };
  if (!leadTypeOk(input.leadType)) return { eligible: false, reason: "wrong_lead_type" };
  if (!statusOk(input.status)) {
    const ls = leadStatusReason(input.status);
    if (ls) return { eligible: false, reason: ls };
    return { eligible: false, reason: "wrong_status" };
  }
  if (input.listingRemoved) return { eligible: false, reason: "removed_listing" };
  if (input.deferClaimPath) return { eligible: false, reason: "defer_claim_path" };
  if (input.hasPendingDraft) return { eligible: false, reason: "pending_draft" };
  if (input.hasRecentOutreachSend) return { eligible: false, reason: "duplicate_recent_send" };
  if (input.suppressionBlocked) return { eligible: false, reason: "suppressed" };

  const contactReason = contactStatusReason(input.contact);
  if (contactReason) return { eligible: false, reason: contactReason };

  const emailHost = hostFromEmail(email);
  const siteHost =
    input.websiteHostNormalized?.trim().toLowerCase() ||
    hostFromUrl(input.websiteUrl) ||
    hostFromUrl(input.contactUrl);

  const hay = `${email} ${siteHost ?? ""} ${input.websiteUrl ?? ""} ${input.contactUrl ?? ""}`;
  if (CHAMBER_TOURISM.test(hay)) return { eligible: false, reason: "chamber_tourism" };
  if (emailHost && /(chamber|tourism|visitor|convention|bureau|destination)/.test(emailHost)) {
    return { eligible: false, reason: "chamber_tourism" };
  }
  if (siteHost && /(chamber|tourism|visitor|convention|bureau|destination)/.test(siteHost)) {
    return { eligible: false, reason: "chamber_tourism" };
  }
  if (DIRECTORY_AGG.test(hay)) return { eligible: false, reason: "directory_aggregator" };

  if (input.leadType === "VENUE" && !openMicSignalOk(input.openMicSignalTier, input.sourceKind)) {
    return { eligible: false, reason: "weak_open_mic_signal" };
  }

  if (isFreeMailHost(emailHost)) {
    if (!siteHost || !emailDomainMatchesSiteHost(email, siteHost)) {
      return { eligible: false, reason: "free_mail_mismatch" };
    }
  } else if (siteHost && emailHost && !emailDomainMatchesSiteHost(email, siteHost)) {
    const roleOk = PREFERRED_ROLE_LOCAL.test(email);
    if (!roleOk) return { eligible: false, reason: "domain_mismatch" };
  }

  return { eligible: true, reason: "eligible" };
}

/** Load contextual flags and evaluate eligibility for one lead. */
export async function explainGrowthLeadOutreachEligibility(
  prisma: PrismaClient,
  leadId: string,
): Promise<{ eligible: boolean; reason: OutreachEligibilityReason; lead: GrowthLead | null }> {
  const lead = await prisma.growthLead.findUnique({
    where: { id: leadId },
    include: {
      publicListings: {
        where: { removedAt: null },
        select: {
          verificationStatus: true,
          claimStatus: true,
          claimInviteEmailSentAt: true,
          removedAt: true,
        },
        take: 3,
      },
      outreachDrafts: {
        where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!lead) return { eligible: false, reason: "missing_email", lead: null };

  const email = normalizeMarketingEmail(lead.contactEmailNormalized ?? "");
  const contact = email
    ? await prisma.marketingContact.findUnique({ where: { emailNormalized: email } })
    : null;
  const sup = email ? await isMarketingEmailSuppressed(prisma, email) : { suppressed: false };

  const verifiedUnclaimed = lead.publicListings.some(
    (l) =>
      l.verificationStatus === "VERIFIED" &&
      l.claimStatus !== "CLAIMED" &&
      !l.claimInviteEmailSentAt,
  );

  const recentSend =
    email &&
    (await prisma.marketingEmailSend.findFirst({
      where: {
        toEmailNormalized: email,
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { id: true },
    }));

  const result = evaluateGrowthLeadOutreachEligibility({
    ...lead,
    hasPendingDraft: lead.outreachDrafts.length > 0,
    hasRecentOutreachSend: Boolean(recentSend),
    deferClaimPath: verifiedUnclaimed,
    listingRemoved: lead.publicListings.some((l) => l.removedAt != null),
    contact,
    suppressionBlocked: sup.suppressed,
  });

  return { ...result, lead };
}

export type OutreachEligibilityAuditCounts = Record<OutreachEligibilityReason, number> & {
  totalLeads: number;
  highConfidenceContacts: number;
  netSendEligible: number;
};

/** Read-only production audit of general outreach pool. */
export async function auditGeneralOutreachEligibility(prisma: PrismaClient): Promise<OutreachEligibilityAuditCounts> {
  const counts = {
    totalLeads: 0,
    highConfidenceContacts: 0,
    netSendEligible: 0,
    eligible: 0,
    missing_email: 0,
    not_high_confidence: 0,
    wrong_lead_type: 0,
    wrong_status: 0,
    weak_open_mic_signal: 0,
    chamber_tourism: 0,
    directory_aggregator: 0,
    free_mail_mismatch: 0,
    domain_mismatch: 0,
    role_mismatch: 0,
    lead_status_blocked: 0,
    suppressed: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
    do_not_contact: 0,
    removed_listing: 0,
    pending_draft: 0,
    already_contacted: 0,
    defer_claim_path: 0,
    duplicate_recent_send: 0,
  } satisfies OutreachEligibilityAuditCounts;

  counts.totalLeads = await prisma.growthLead.count();
  counts.highConfidenceContacts = await prisma.growthLead.count({
    where: { contactEmailNormalized: { not: null }, contactEmailConfidence: "HIGH" },
  });

  const batchSize = 500;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.growthLead.findMany({
      where: { contactEmailNormalized: { not: null }, contactEmailConfidence: "HIGH" },
      select: {
        id: true,
        leadType: true,
        status: true,
        name: true,
        contactEmailNormalized: true,
        contactEmailConfidence: true,
        websiteUrl: true,
        contactUrl: true,
        websiteHostNormalized: true,
        openMicSignalTier: true,
        sourceKind: true,
        publicListings: {
          where: { removedAt: null },
          select: {
            verificationStatus: true,
            claimStatus: true,
            claimInviteEmailSentAt: true,
            removedAt: true,
          },
          take: 3,
        },
        outreachDrafts: {
          where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    const emails = rows.map((r) => normalizeMarketingEmail(r.contactEmailNormalized ?? "")).filter(Boolean) as string[];
    const contacts = await prisma.marketingContact.findMany({
      where: { emailNormalized: { in: emails } },
    });
    const contactMap = new Map(contacts.map((c) => [c.emailNormalized, c]));

    const recentSends = await prisma.marketingEmailSend.findMany({
      where: {
        toEmailNormalized: { in: emails },
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { toEmailNormalized: true },
      distinct: ["toEmailNormalized"],
    });
    const recentSet = new Set(recentSends.map((s) => s.toEmailNormalized));

    for (const row of rows) {
      const email = normalizeMarketingEmail(row.contactEmailNormalized ?? "") ?? "";
      const sup = email ? await isMarketingEmailSuppressed(prisma, email) : { suppressed: false };
      const verifiedUnclaimed = row.publicListings.some(
        (l) =>
          l.verificationStatus === "VERIFIED" &&
          l.claimStatus !== "CLAIMED" &&
          !l.claimInviteEmailSentAt,
      );
      const { reason } = evaluateGrowthLeadOutreachEligibility({
        ...row,
        hasPendingDraft: row.outreachDrafts.length > 0,
        hasRecentOutreachSend: recentSet.has(email),
        deferClaimPath: verifiedUnclaimed,
        listingRemoved: false,
        contact: contactMap.get(email) ?? null,
        suppressionBlocked: sup.suppressed,
      });
      counts[reason] += 1;
      if (reason === "eligible") counts.netSendEligible += 1;
    }

    cursor = rows[rows.length - 1]?.id;
    if (rows.length < batchSize) break;
  }

  return counts;
}
