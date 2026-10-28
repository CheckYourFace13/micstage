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

/** Directory / social hosts are never an official venue mailbox domain. */
const NON_OFFICIAL_CLAIM_HOSTS = new Set([
  "eventbrite.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "yelp.com",
  "tripadvisor.com",
  "timeout.com",
  "bandcamp.com",
  "ticketmaster.com",
  "dice.fm",
  "residentadvisor.net",
  "ra.co",
  "songkick.com",
  "bandsintown.com",
  "meetup.com",
  "craigslist.org",
  "wikipedia.org",
  "blogspot.com",
  "chicagotribune.com",
  "nytimes.com",
  "latimes.com",
  "washingtonpost.com",
  "npr.org",
  "spotify.com",
  "youtube.com",
]);

/**
 * Accepts full URLs and bare hosts (`emptybottle.com`) so stored websites without
 * a scheme still count as an official business domain.
 */
export function parseWebsiteHost(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const raw = url.trim();
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function hostFromUrl(url: string | null | undefined): string | null {
  return parseWebsiteHost(url);
}

export function isNonOfficialClaimHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const h = host.replace(/^www\./i, "").toLowerCase();
  if (NON_OFFICIAL_CLAIM_HOSTS.has(h)) return true;
  for (const blocked of NON_OFFICIAL_CLAIM_HOSTS) {
    if (h === blocked || h.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/**
 * Official venue host for claim-invite domain match.
 * Prefers the listing website; ignores Facebook/directory source URLs so they
 * do not create false domain mismatches.
 */
export function officialClaimSiteHost(
  websiteUrl?: string | null,
  sourceUrl?: string | null,
): string | null {
  const web = parseWebsiteHost(websiteUrl);
  if (web && !isNonOfficialClaimHost(web)) return web;
  const src = parseWebsiteHost(sourceUrl);
  if (src && !isNonOfficialClaimHost(src)) return src;
  return null;
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
