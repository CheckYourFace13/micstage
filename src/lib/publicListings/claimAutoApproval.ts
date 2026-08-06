/**
 * Automatic vs manual claim approval eligibility for official-domain instant claims.
 */
import type { GrowthLeadEmailConfidence } from "@/generated/prisma/client";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
]);

export type ClaimAuthorityRole = "owner" | "manager" | "authorized_employee" | "authorized_event_host";

export const CLAIM_AUTHORITY_ROLES: ClaimAuthorityRole[] = [
  "owner",
  "manager",
  "authorized_employee",
  "authorized_event_host",
];

function hostFromEmail(email: string): string | null {
  const i = email.lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function isFreeMailDomain(emailOrHost: string): boolean {
  const host = emailOrHost.includes("@") ? hostFromEmail(emailOrHost) : emailOrHost.toLowerCase();
  return Boolean(host && FREE_MAIL.has(host));
}

export type InstantClaimEligibilityInput = {
  verificationStatus: string;
  claimStatus: string;
  claimedVenueId: string | null;
  hasConflictingActiveClaim: boolean;
  tokenValid: boolean;
  intendedEmailNormalized: string;
  loginEmailNormalized: string;
  contactConfidence: GrowthLeadEmailConfidence | null | undefined;
  websiteUrl: string | null | undefined;
  sourceUrl: string | null | undefined;
  googlePlaceId: string | null | undefined;
  placeAlreadyOnAnotherVenue: boolean;
  authorityConfirmed: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  fraudSuspicion?: boolean;
  geoConflict?: boolean;
  emailSuppressed?: boolean;
  role: string;
};

export type InstantClaimEligibilityResult =
  | { autoApprove: true }
  | { autoApprove: false; reason: string; manualReview: true };

/**
 * Auto-approve only when every official-domain condition passes.
 * Ambiguous cases return manualReview.
 */
export function evaluateInstantClaimAutoApproval(
  input: InstantClaimEligibilityInput,
): InstantClaimEligibilityResult {
  if (input.verificationStatus !== "VERIFIED") {
    return { autoApprove: false, reason: "listing_not_verified", manualReview: true };
  }
  if (input.claimedVenueId || input.claimStatus === "CLAIMED") {
    return { autoApprove: false, reason: "already_claimed", manualReview: true };
  }
  if (input.hasConflictingActiveClaim) {
    return { autoApprove: false, reason: "conflicting_active_claim", manualReview: true };
  }
  if (!input.tokenValid) {
    return { autoApprove: false, reason: "invalid_token", manualReview: true };
  }
  if (!input.authorityConfirmed || !input.termsAccepted || !input.privacyAccepted) {
    return { autoApprove: false, reason: "consent_incomplete", manualReview: true };
  }
  if (input.fraudSuspicion) {
    return { autoApprove: false, reason: "fraud_suspicion", manualReview: true };
  }
  if (input.geoConflict) {
    return { autoApprove: false, reason: "geographic_conflict", manualReview: true };
  }
  if (input.emailSuppressed) {
    return { autoApprove: false, reason: "email_suppressed", manualReview: true };
  }
  if (input.loginEmailNormalized !== input.intendedEmailNormalized) {
    return { autoApprove: false, reason: "login_email_changed", manualReview: true };
  }
  if (input.contactConfidence !== "HIGH") {
    return { autoApprove: false, reason: "confidence_not_high", manualReview: true };
  }
  if (isFreeMailDomain(input.loginEmailNormalized)) {
    return { autoApprove: false, reason: "free_mail", manualReview: true };
  }

  const siteHost = hostFromUrl(input.websiteUrl) || hostFromUrl(input.sourceUrl);
  if (!siteHost || !emailDomainMatchesSiteHost(input.loginEmailNormalized, siteHost)) {
    return { autoApprove: false, reason: "domain_mismatch", manualReview: true };
  }
  if (input.placeAlreadyOnAnotherVenue) {
    return { autoApprove: false, reason: "place_already_on_venue", manualReview: true };
  }
  if (!CLAIM_AUTHORITY_ROLES.includes(input.role as ClaimAuthorityRole)) {
    return { autoApprove: false, reason: "role_invalid", manualReview: true };
  }
  if (!input.googlePlaceId) {
    return { autoApprove: false, reason: "missing_google_place", manualReview: true };
  }

  return { autoApprove: true };
}
