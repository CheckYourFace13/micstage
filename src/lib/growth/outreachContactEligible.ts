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
import {
  classifyOutreachTargetIdentity,
  type OutreachTargetClassification,
} from "@/lib/growth/outreachTargetIdentity";
import { classifyOutreachNameQuality } from "@/lib/growth/outreachNameQuality";
import { classifyOutreachGeoIdentity } from "@/lib/growth/outreachGeoIdentity";
import {
  classifyOutreachOpenMicEvidence,
  type OutreachOpenMicEvidenceResult,
} from "@/lib/growth/outreachOpenMicEvidence";
import type { StoredEvidenceRow } from "@/lib/publicListings/publicOpenMicEvidenceGate";

export type OutreachEligibilityReason =
  | "eligible"
  | "missing_email"
  | "not_high_confidence"
  | "wrong_lead_type"
  | "wrong_status"
  | "weak_open_mic_signal"
  | "no_target_bound_open_mic_evidence"
  | "stale_open_mic_evidence"
  | "artist_bio_false_positive"
  | "microphone_equipment_false_positive"
  | "name_quality"
  | "geography_conflict"
  | "festival_event_not_venue"
  | "chamber_tourism"
  | "directory_aggregator"
  | "service_company"
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
  | "duplicate_recent_send"
  | "weak_identity"
  | "needs_manual_review";

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
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  listingLat?: number | null;
  listingLng?: number | null;
  listingWebsiteUrl?: string | null;
  listingSourceUrl?: string | null;
  listingName?: string | null;
  city?: string | null;
  region?: string | null;
  discoveryMarketSlug?: string | null;
  internalNotes?: string | null;
  discoveryHints?: unknown;
  sourceTitle?: string | null;
  sourceSnippet?: string | null;
  sourceUrl?: string | null;
  about?: string | null;
  lastVerifiedAt?: Date | null;
  schedules?: Array<{
    title: string | null;
    description: string | null;
    weekday?: string | null;
    isActive?: boolean | null;
  }> | null;
  storedEvidence?: StoredEvidenceRow[] | null;
};

/** Pure eligibility evaluation (no DB). */
export function evaluateGrowthLeadOutreachEligibility(input: GrowthLeadOutreachInput): {
  eligible: boolean;
  reason: OutreachEligibilityReason;
  target?: OutreachTargetClassification;
  evidence?: OutreachOpenMicEvidenceResult;
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

  const target = classifyOutreachTargetIdentity({
    name: input.name,
    leadType: input.leadType,
    websiteUrl: input.websiteUrl,
    contactUrl: input.contactUrl,
    websiteHostNormalized: input.websiteHostNormalized,
    contactEmailNormalized: email,
    sourceKind: input.sourceKind,
    openMicSignalTier: input.openMicSignalTier,
    city: input.city,
    region: input.region,
    formattedAddress: input.formattedAddress,
    googlePlaceId: input.googlePlaceId,
    listingLat: input.listingLat,
    listingLng: input.listingLng,
    listingWebsiteUrl: input.listingWebsiteUrl,
    listingSourceUrl: input.listingSourceUrl,
    listingName: input.listingName,
  });
  if (target.decision === "ineligible") {
    if (target.reason === "chamber_tourism") return { eligible: false, reason: "chamber_tourism", target };
    if (target.reason === "directory_aggregator") return { eligible: false, reason: "directory_aggregator", target };
    if (target.reason === "service_company") return { eligible: false, reason: "service_company", target };
    return { eligible: false, reason: "weak_identity", target };
  }
  if (target.decision === "manual_review") {
    return { eligible: false, reason: "needs_manual_review", target };
  }

  const nameQ = classifyOutreachNameQuality({ name: input.name, listingName: input.listingName });
  if (nameQ.festival) {
    return { eligible: false, reason: "festival_event_not_venue", target };
  }
  if (!nameQ.ok) {
    return { eligible: false, reason: "name_quality", target };
  }

  const geo = classifyOutreachGeoIdentity({
    name: input.name,
    city: input.city,
    region: input.region,
    formattedAddress: input.formattedAddress,
    listingCity: input.listingName ? input.city : input.city,
    listingRegion: input.region,
    websiteHostNormalized: input.websiteHostNormalized,
    websiteUrl: input.websiteUrl,
    discoveryMarketSlug: input.discoveryMarketSlug,
  });
  if (geo.conflict) {
    return { eligible: false, reason: "geography_conflict", target };
  }

  const evidence = classifyOutreachOpenMicEvidence({
    name: input.name,
    listingName: input.listingName,
    websiteUrl: input.websiteUrl,
    websiteHostNormalized: input.websiteHostNormalized,
    city: input.city,
    region: input.region,
    sourceKind: input.sourceKind,
    internalNotes: input.internalNotes,
    discoveryHints: input.discoveryHints,
    sourceTitle: input.sourceTitle,
    sourceSnippet: input.sourceSnippet,
    sourceUrl: input.sourceUrl || input.listingSourceUrl,
    listingSourceUrl: input.listingSourceUrl,
    listingWebsiteUrl: input.listingWebsiteUrl,
    about: input.about,
    lastVerifiedAt: input.lastVerifiedAt,
    schedules: input.schedules,
    storedEvidence: input.storedEvidence,
  });
  if (!evidence.autoSend) {
    const reason: OutreachEligibilityReason =
      evidence.rejectClass === "stale_open_mic_evidence"
        ? "stale_open_mic_evidence"
        : evidence.rejectClass === "artist_bio_false_positive"
          ? "artist_bio_false_positive"
          : evidence.rejectClass === "microphone_equipment_false_positive"
            ? "microphone_equipment_false_positive"
            : evidence.tier === "C"
              ? "needs_manual_review"
              : "no_target_bound_open_mic_evidence";
    return { eligible: false, reason, target, evidence };
  }

  if (isFreeMailHost(emailHost)) {
    if (!siteHost || !emailDomainMatchesSiteHost(email, siteHost)) {
      return { eligible: false, reason: "free_mail_mismatch", target };
    }
  } else if (siteHost && emailHost && !emailDomainMatchesSiteHost(email, siteHost)) {
    const roleOk = PREFERRED_ROLE_LOCAL.test(email);
    if (!roleOk) return { eligible: false, reason: "domain_mismatch", target };
  }

  return { eligible: true, reason: "eligible", target, evidence };
}

/** True when another in-flight draft should block *new* outreach. The draft currently being sent is ignored. */
export function hasOtherInFlightOutreachDraft(drafts: { id: string }[], ignoreDraftId?: string): boolean {
  if (!ignoreDraftId) return drafts.length > 0;
  return drafts.some((d) => d.id !== ignoreDraftId);
}

const LISTING_IDENTITY_SELECT = {
  verificationStatus: true,
  claimStatus: true,
  claimInviteEmailSentAt: true,
  removedAt: true,
  name: true,
  formattedAddress: true,
  googlePlaceId: true,
  lat: true,
  lng: true,
  websiteUrl: true,
  sourceUrl: true,
  sourceName: true,
  about: true,
  lastVerifiedAt: true,
  googlePlaceVerifiedAt: true,
  city: true,
  region: true,
  schedules: {
    where: { isActive: true },
    select: { title: true, description: true, weekday: true, isActive: true },
    take: 8,
  },
  openMicEvidenceRows: {
    select: {
      trusted: true,
      reviewOnly: true,
      detectedPhrase: true,
      evidenceExcerpt: true,
      evidenceTitle: true,
      evidenceDate: true,
      fetchedAt: true,
      sourceType: true,
      reasonCode: true,
      evidenceUrl: true,
    },
    take: 8,
  },
} as const;

function identityFieldsFromListings(
  listings: Array<{
    name: string;
    formattedAddress: string | null;
    googlePlaceId: string | null;
    lat: number | null;
    lng: number | null;
    websiteUrl: string | null;
    sourceUrl: string | null;
    sourceName?: string | null;
    about?: string | null;
    lastVerifiedAt?: Date | null;
    city: string | null;
    region: string | null;
    schedules?: Array<{
      title: string | null;
      description: string | null;
      weekday?: string | null;
      isActive?: boolean | null;
    }>;
    openMicEvidenceRows?: StoredEvidenceRow[];
  }>,
) {
  const listing =
    listings.find((l) => l.googlePlaceId && l.lat != null && l.lng != null) ?? listings[0] ?? null;
  return {
    formattedAddress: listing?.formattedAddress ?? null,
    googlePlaceId: listing?.googlePlaceId ?? null,
    listingLat: listing?.lat ?? null,
    listingLng: listing?.lng ?? null,
    listingWebsiteUrl: listing?.websiteUrl ?? null,
    listingSourceUrl: listing?.sourceUrl ?? null,
    listingName: listing?.name ?? null,
    listingCity: listing?.city ?? null,
    listingRegion: listing?.region ?? null,
    sourceTitle: listing?.sourceName ?? null,
    sourceUrl: listing?.sourceUrl ?? null,
    about: listing?.about ?? null,
    lastVerifiedAt: listing?.lastVerifiedAt ?? null,
    schedules: listing?.schedules ?? null,
    storedEvidence: listing?.openMicEvidenceRows ?? null,
  };
}

/** Load contextual flags and evaluate eligibility for one lead. */
export async function explainGrowthLeadOutreachEligibility(
  prisma: PrismaClient,
  leadId: string,
  opts?: { ignoreDraftId?: string },
): Promise<{
  eligible: boolean;
  reason: OutreachEligibilityReason;
  lead: GrowthLead | null;
  target?: OutreachTargetClassification;
}> {
  const lead = await prisma.growthLead.findUnique({
    where: { id: leadId },
    include: {
      publicListings: {
        where: { removedAt: null },
        select: LISTING_IDENTITY_SELECT,
        take: 3,
      },
      outreachDrafts: {
        where: {
          status: { in: ["PENDING_REVIEW", "APPROVED"] },
          ...(opts?.ignoreDraftId ? { id: { not: opts.ignoreDraftId } } : {}),
        },
        select: { id: true },
        take: 2,
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

  const ident = identityFieldsFromListings(lead.publicListings);
  const result = evaluateGrowthLeadOutreachEligibility({
    ...lead,
    city: lead.city ?? ident.listingCity,
    region: lead.region ?? ident.listingRegion,
    ...ident,
    hasPendingDraft: hasOtherInFlightOutreachDraft(lead.outreachDrafts, opts?.ignoreDraftId),
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
    service_company: 0,
    weak_identity: 0,
    needs_manual_review: 0,
    no_target_bound_open_mic_evidence: 0,
    stale_open_mic_evidence: 0,
    artist_bio_false_positive: 0,
    microphone_equipment_false_positive: 0,
    name_quality: 0,
    geography_conflict: 0,
    festival_event_not_venue: 0,
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
        city: true,
        region: true,
        discoveryMarketSlug: true,
        internalNotes: true,
        discoveryHints: true,
        publicListings: {
          where: { removedAt: null },
          select: LISTING_IDENTITY_SELECT,
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
      const ident = identityFieldsFromListings(row.publicListings);
      const { reason } = evaluateGrowthLeadOutreachEligibility({
        ...row,
        city: row.city ?? ident.listingCity,
        region: row.region ?? ident.listingRegion,
        ...ident,
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
