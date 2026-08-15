import type { GrowthLeadEmailConfidence } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

/** Shared predicate: one-touch claim invites only for public VERIFIED listings awaiting claim. */
export const CLAIM_INVITE_LISTING_WHERE = {
  claimInviteEmailSentAt: null,
  claimedVenueId: null,
  claimStatus: { not: "CLAIMED" as const },
  verificationStatus: "VERIFIED" as const,
  removedAt: null,
  growthLead: { contactEmailNormalized: { not: null } },
} as const;

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function hostFromEmail(email: string): string | null {
  const i = email.lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function hostsRelated(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Claim-invite email eligibility: HIGH always; MEDIUM only when the mailbox
 * domain matches the listing/venue website (tightened — avoids random scraped addresses).
 */
export function isClaimInviteEmailEligible(input: {
  email: string;
  confidence: GrowthLeadEmailConfidence | null | undefined;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const email = normalizeMarketingEmail(input.email);
  if (!email) return false;
  if (input.confidence === "LOW" || input.confidence == null) return false;
  if (input.confidence === "HIGH") return true;
  if (input.confidence !== "MEDIUM") return false;

  const emailHost = hostFromEmail(email);
  if (!emailHost) return false;
  for (const url of [input.websiteUrl, input.sourceUrl]) {
    const siteHost = hostFromUrl(url);
    if (siteHost && hostsRelated(emailHost, siteHost)) return true;
  }
  return false;
}

/** True when email domain matches the page/venue host (same-site scrape → HIGH-eligible). */
export function emailDomainMatchesSiteHost(
  email: string | null | undefined,
  pageHost: string | null | undefined,
): boolean {
  if (!email?.trim() || !pageHost?.trim()) return false;
  const emailHost = hostFromEmail(normalizeMarketingEmail(email) || email);
  const site = pageHost.replace(/^www\./i, "").toLowerCase();
  if (!emailHost || !site) return false;
  return hostsRelated(emailHost, site);
}
