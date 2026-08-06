/**
 * Production-only approved canary claim invite (allowlisted listings).
 * Uses server Resend config — never requires local RESEND_API_KEY.
 * Does not enable the general claim cron.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { appBaseUrl, transactionalFromAddress } from "@/lib/marketing/emailConfig";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import { isFreeMailDomain } from "@/lib/publicListings/claimAutoApproval";
import { issueListingClaimInviteToken } from "@/lib/publicListings/claimInviteToken";
import { buildListingClaimInvitePayload } from "@/lib/publicListings/listingClaimInviteEmail";
import {
  isStagedClaimInviteContactEligible,
  listingPassesStagedClaimInviteSafety,
  redactEmail,
  recordClaimInviteSendStat,
} from "@/lib/publicListings/claimInviteAutomation";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";

/** Hard allowlist — no recipient emails stored here. */
export const APPROVED_CLAIM_CANARY_SLUGS: Record<
  string,
  { label: string; expectedDomains: string[]; nameIncludes: string[] }
> = {
  "game-of-jokes-open-mic-competition-west-leigh-street-richmond": {
    label: "Game of Jokes / Starr Hill",
    expectedDomains: ["starrhill.com"],
    nameIncludes: ["Game of Jokes"],
  },
  "monday-night-poetry-open-mic-hosted-by-keeping-it-p": {
    label: "Monday Night Poetry / Choose901",
    expectedDomains: ["choose901.com"],
    nameIncludes: ["Monday Night Poetry"],
  },
};

const CONFIRM_VALUE = "SEND_REAL_CANARY";

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().replace(/^www\./, "") || null;
}

function hostsRelated(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export type CanarySendResult =
  | {
      ok: true;
      sent: true;
      label: string;
      listingId: string;
      listingSlug: string;
      subjectSent: string;
      recipientRedacted: string;
      recipientDomain: string;
      tokenId: string;
      tokenStatus: string;
      tokenExpiresAt: string;
      providerAccepted: true;
      providerMessageIdRedacted: string;
      claimInviteEmailSentAt: string;
      auditEventId: string;
      claimPageVerification: Record<string, unknown>;
    }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export async function sendApprovedClaimCanaryInvite(
  prisma: PrismaClient,
  input: {
    listingSlug: string;
    expectedDomain: string;
    expectedRecipient?: string | null;
    useGrowthLeadEmail?: boolean;
    confirm: string;
    /** When true, fetch claim page with live token in-memory (never returned). */
    verifyClaimPage?: boolean;
  },
): Promise<CanarySendResult> {
  if (input.confirm !== CONFIRM_VALUE) {
    return { ok: false, error: "invalid_confirm_value" };
  }
  if (process.env.NODE_ENV === "development" && process.env.MICSTAGE_ALLOW_CANARY_IN_DEV !== "1") {
    // Still allow on Hostinger production runtime; local Next often has NODE_ENV=production for builds.
  }

  const allow = APPROVED_CLAIM_CANARY_SLUGS[input.listingSlug];
  if (!allow) {
    return { ok: false, error: "slug_not_in_allowlist", detail: { listingSlug: input.listingSlug } };
  }

  const expectedDomain = input.expectedDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!allow.expectedDomains.some((d) => hostsRelated(expectedDomain, d))) {
    return { ok: false, error: "expected_domain_not_approved" };
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: input.listingSlug },
    include: {
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
        },
      },
      claimRequests: {
        where: { status: { in: ["PENDING", "APPROVED"] } },
        select: { id: true },
      },
    },
  });
  if (!listing) return { ok: false, error: "listing_not_found" };

  for (const needle of allow.nameIncludes) {
    if (!listing.name.includes(needle)) {
      return { ok: false, error: "listing_name_mismatch" };
    }
  }

  const safety = listingPassesStagedClaimInviteSafety(listing);
  if (!safety.ok) return { ok: false, error: safety.reason };

  const leadEmail = listing.growthLead?.contactEmailNormalized
    ? normalizeMarketingEmail(listing.growthLead.contactEmailNormalized)
    : null;
  if (!leadEmail) return { ok: false, error: "growth_lead_email_missing" };

  let email = leadEmail;
  if (input.expectedRecipient?.trim()) {
    const expected = normalizeMarketingEmail(input.expectedRecipient);
    if (!expected || expected !== leadEmail) {
      return {
        ok: false,
        error: "expected_recipient_mismatch",
        detail: { expectedRedacted: expected ? redactEmail(expected) : null, leadRedacted: redactEmail(leadEmail) },
      };
    }
    email = expected;
  } else if (!input.useGrowthLeadEmail) {
    return { ok: false, error: "missing_recipient_or_use_growth_lead_email" };
  }

  const recipDomain = emailDomain(email);
  if (!recipDomain || !hostsRelated(recipDomain, expectedDomain)) {
    return { ok: false, error: "recipient_domain_mismatch" };
  }
  if (isFreeMailDomain(email)) return { ok: false, error: "free_mail" };

  const siteHost =
    hostFromUrl(listing.websiteUrl) ||
    hostFromUrl(listing.growthLead?.websiteUrl) ||
    hostFromUrl(listing.sourceUrl);
  if (!siteHost || !emailDomainMatchesSiteHost(email, siteHost)) {
    return { ok: false, error: "official_domain_mismatch" };
  }

  if (
    !isStagedClaimInviteContactEligible({
      email,
      confidence: listing.growthLead?.contactEmailConfidence,
      websiteUrl: listing.websiteUrl ?? listing.growthLead?.websiteUrl,
      sourceUrl: listing.sourceUrl,
    })
  ) {
    return { ok: false, error: "contact_not_eligible" };
  }

  const suppressed = await isMarketingEmailSuppressed(prisma, email);
  if (suppressed.suppressed) {
    return { ok: false, error: `suppressed:${suppressed.reason ?? "unknown"}` };
  }

  if (listing.claimInviteEmailSentAt) return { ok: false, error: "already_sent" };

  const activeTokens = await prisma.listingClaimInviteToken.count({
    where: { listingId: listing.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
  });
  if (activeTokens > 0) return { ok: false, error: "active_token_exists" };

  if (listing.claimRequests.length > 0) return { ok: false, error: "conflicting_claim_request" };

  if (listing.googlePlaceId) {
    const placeOnVenue = await prisma.venue.count({ where: { googlePlaceId: listing.googlePlaceId } });
    if (placeOnVenue > 0) return { ok: false, error: "place_on_another_venue" };
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return { ok: false, error: "resend_api_key_missing_on_server" };
  }
  if (!process.env.EMAIL_FROM?.trim()) {
    return { ok: false, error: "email_from_missing_on_server" };
  }

  const ownersBefore = await prisma.venueOwner.count();

  const issued = await issueListingClaimInviteToken(prisma, {
    listingId: listing.id,
    intendedEmailNormalized: email,
  });

  const base = appBaseUrl().replace(/\/$/, "") || "https://micstage.com";
  const claimUrl = `${base}/claim/invite/${issued.rawToken}`;
  const payload = buildListingClaimInvitePayload({
    listingName: listing.name,
    listingSlug: listing.slug,
    city: listing.city,
    region: listing.region,
    venueName: listing.name,
    claimUrl,
  });

  if (payload.subject !== "Claim your free MicStage open mic listing") {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { ok: false, error: "subject_mismatch" };
  }

  let sendResult: { messageId?: string; skipped?: boolean };
  try {
    sendResult = await deliverResendEmail({
      to: email,
      subject: payload.subject,
      text: payload.textBody,
      html: payload.htmlBody,
      category: "transactional",
      fromOverride: transactionalFromAddress(),
      replyTo: "drummer@micstage.com",
      allowDevSkipWhenNoApiKey: false,
    });
  } catch (e) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return {
      ok: false,
      error: "provider_send_failed",
      detail: { message: e instanceof Error ? e.message : String(e), tokenStatus: "REVOKED" },
    };
  }

  if (sendResult.skipped || !sendResult.messageId) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { ok: false, error: "provider_did_not_accept", detail: { tokenStatus: "REVOKED" } };
  }

  const stampedAt = new Date();
  await prisma.publicOpenMicListing.update({
    where: { id: listing.id },
    data: {
      claimInviteEmailSentAt: stampedAt,
      claimInviteEmail: email,
      claimInviteProviderMessageId: sendResult.messageId,
    },
  });

  const audit = await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: listing.id,
      eventType: "CLAIM_INVITE_SENT",
      meta: {
        tokenId: issued.tokenId,
        hasProviderMessageId: true,
        emailDomain: recipDomain,
        canary: true,
        source: "claim-invite-canary-api",
        providerMessageIdPrefix: String(sendResult.messageId).slice(0, 8),
      },
    },
  });

  await recordClaimInviteSendStat(prisma);

  let claimPageVerification: Record<string, unknown> = { skipped: true };
  if (input.verifyClaimPage !== false) {
    try {
      // Manual redirect so we can forward the HttpOnly session cookie to the clean URL.
      const first = await fetch(claimUrl, {
        headers: { "User-Agent": "MicStageCanaryVerify/1.0" },
        redirect: "manual",
      });
      const setCookie = first.headers.getSetCookie?.() ?? [];
      const cookieHeader = setCookie
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
      const location = first.headers.get("location");
      let finalStatus = first.status;
      let body = await first.text();
      let finalUrl = claimUrl;
      if (first.status >= 300 && first.status < 400 && location) {
        finalUrl = new URL(location, claimUrl).toString();
        const second = await fetch(finalUrl, {
          headers: {
            "User-Agent": "MicStageCanaryVerify/1.0",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          redirect: "follow",
        });
        finalStatus = second.status;
        body = await second.text();
        finalUrl = second.url || finalUrl;
      }
      const ownersAfter = await prisma.venueOwner.count();
      const fullEmailExposed = body.includes(email);
      const path = (() => {
        try {
          return new URL(finalUrl).pathname;
        } catch {
          return "";
        }
      })();
      claimPageVerification = {
        httpStatus: finalStatus,
        loadsOk: finalStatus === 200,
        exchangedToCleanUrl: path === "/claim/invite" || path === "/claim/invite/",
        showsListingName: body.includes(listing.name),
        requiresAuthority:
          /data-claim-authority="required"/i.test(body) ||
          /I confirm that I am the owner, manager, authorized employee/i.test(body),
        requiresTerms: /terms of service/i.test(body),
        requiresPrivacy: /privacy policy/i.test(body),
        recipientEmailNotInHtml: !fullEmailExposed,
        rawTokenNotInHtml: !body.includes(issued.rawToken),
        invitationUnavailable: /invitation unavailable/i.test(body),
        venueOwnersUnchanged: ownersAfter === ownersBefore,
        note: "Token exchanged for session cookie; form not submitted; raw token discarded.",
      };
    } catch (e) {
      claimPageVerification = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Drop raw token from memory path — do not return it.
  const msgId = String(sendResult.messageId);
  const providerMessageIdRedacted =
    msgId.length <= 8 ? "[redacted]" : `${msgId.slice(0, 4)}…${msgId.slice(-4)}`;

  return {
    ok: true,
    sent: true,
    label: allow.label,
    listingId: listing.id,
    listingSlug: listing.slug,
    subjectSent: payload.subject,
    recipientRedacted: redactEmail(email),
    recipientDomain: recipDomain,
    tokenId: issued.tokenId,
    tokenStatus: "ACTIVE",
    tokenExpiresAt: issued.expiresAt.toISOString(),
    providerAccepted: true,
    providerMessageIdRedacted,
    claimInviteEmailSentAt: stampedAt.toISOString(),
    auditEventId: audit.id,
    claimPageVerification,
  };
}
