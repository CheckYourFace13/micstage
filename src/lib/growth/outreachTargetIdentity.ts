/**
 * Target-business identity for general marketing outreach.
 *
 * HIGH email confidence is not enough. Auto-send only when the contact looks like
 * a real venue or a named promoter/organizer — not a directory, tourism page,
 * or service vendor that happens to mention open mics.
 */
import type { GrowthLeadType } from "@/generated/prisma/client";
import { classifyListingName } from "@/lib/publicListings/listingQuality";
import { isNonVenueEvidenceHost } from "@/lib/publicListings/evidenceTrust";

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

export type OutreachTargetIdentityKind = "VENUE" | "PROMOTER" | "UNKNOWN";

export type OutreachTargetDecision = "eligible_venue" | "eligible_promoter" | "manual_review" | "ineligible";

export type OutreachTargetRejectClass =
  | "directory"
  | "service_company"
  | "chamber_tourism"
  | "weak_identity"
  | "other";

export type OutreachTargetIdentityInput = {
  name: string;
  leadType: GrowthLeadType;
  websiteUrl?: string | null;
  contactUrl?: string | null;
  websiteHostNormalized?: string | null;
  contactEmailNormalized?: string | null;
  sourceKind?: string | null;
  openMicSignalTier?: string | null;
  city?: string | null;
  region?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  listingLat?: number | null;
  listingLng?: number | null;
  listingWebsiteUrl?: string | null;
  listingSourceUrl?: string | null;
  listingName?: string | null;
};

export type OutreachTargetClassification = {
  decision: OutreachTargetDecision;
  identity: OutreachTargetIdentityKind;
  rejectClass: OutreachTargetRejectClass | null;
  reason: string;
  summary: string;
  cta: "venue" | "promoter" | null;
};

const KNOWN_DIRECTORY_HOSTS = new Set([
  "opencomedy.com",
  "eventbrite.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "yelp.com",
  "tripadvisor.com",
  "bandsintown.com",
  "songkick.com",
  "meetup.com",
  "allevents.in",
  "timeout.com",
  "thrillist.com",
  "patch.com",
  "do512.com",
  "ticketmaster.com",
  "ticketnetwork.com",
  "dice.fm",
  "bandsintown.com",
]);

const DIRECTORY_HOST_RE =
  /\b(directory|listings?|allevents|eventbrite|opencomedy|do512|timeout|thrillist|patch|songkick|bandsintown|meetup|ticketmaster|ticketnetwork|tripadvisor|yelp)\b/i;

const DIRECTORY_PATH_RE =
  /\/(?:usa|us|uk|ca)\/(?:gigs|events|listings|venues|shows)\b|\/gigs\/|\/listings?\/|\/directory\/|\/things-to-do\b|\/open-?mics?\/(?:near|in|by)\b|\/events\/in\/|\/near-me\b|\/calendars?\/(?:city|area|region)\b|\/article[_-]|\/\d{4}\/\d{2}\/|\/entertainment\/\d{4}\//i;

const MEDIA_HOST_RE =
  /\b(cleveland\.com|nashvillescene|chicagotribune|latimes|nytimes|timeout|patch\.com|thrillist|bandmix|ticketmaster|do512|allevents)\b/i;

const MEDIA_HOST_GENERIC_RE = /\b(tribune|herald|gazette|chronicle|dispatch|observer)\.com$/i;
const CITY_CALENDAR_HOST_RE = /365\.com$/i;

const GEO_LISTING_NAME_RE =
  /\b((comedy|music|open[\s-]?mic|gig|show|event)s?\s+(shows?|nights?|gigs?|listings?|events?)?\s*near)\b|\bnear\s+[a-z][a-z.\s]+,\s*(united\s+states|[a-z]{2})\b|\b(shows?|gigs?|events?|open[\s-]?mics?)\s+in\s+[a-z]|\bacross the u\.?s|\bshows across\b|\bsecret comedy shows\b/i;

const SEO_LISTICLE_NAME_RE = /^\s*(best|top)\s+\w/i;

const SERVICE_COMPANY_RE =
  /\b(wedding\s+)?djs?\b|\bmobile\s+(dj|disco|entertainment)\b|\bdj\s+(service|company|entertainment)\b|\bwedding\s+(entertainment|planner|planning|photography|photographer)\b|\bphoto\s*booth\b|\bcaterers?\b|\bcatering\b|\b(av|a\/v|audio[\s-]?visual)\s+(company|services?|rental)\b|\bevent\s+(production|planner|planning|staffing|rentals?)\b|\btalent\s+agenc|\bbooking\s+(agenc|service)\b|\bmarketing\s+agenc|\brentals?\s+company\b|\bphotographers?\b|\bvideographers?\b|\bevent\s+planner/i;

const TALENT_OR_BOOKING_RE = /\b(talent\s+agenc|booking\s+(agenc|service)|artist\s+management)\b/i;

const CHAMBER_RE =
  /\b(chamber|tourism|visitor|visitors|convention|bureau|economic[\s-]?development|destination|welcome[\s-]?center)\b/i;

const VENUE_NAME_TOKEN_RE =
  /\b(bar|pub|tavern|brewery|brewpub|taproom|cafe|café|coffeehouse|coffee\s*house|restaurant|grill|lounge|club|comedy\s*club|theater|theatre|hall|room|venue|winery|distillery|nightclub|music\s*hall|listening\s*room|arts?\s*center|playhouse)\b/i;

const PROMOTER_NAME_RE =
  /\b(presents|productions|promotions|promoters?|entertainment\s+group|event\s+co(?:mpany)?)\b/i;

const STREET_ADDRESS_RE =
  /\d{1,6}\s+.+\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pkwy|parkway|hwy|highway|ct|court|pl|place|ter|terrace|ste|suite)\b/i;

function hostOf(input: OutreachTargetIdentityInput): string | null {
  const fromField = input.websiteHostNormalized?.trim().toLowerCase().replace(/^www\./, "") || null;
  return fromField || hostFromUrl(input.websiteUrl) || hostFromUrl(input.listingWebsiteUrl) || hostFromUrl(input.contactUrl);
}

function emailHostOf(input: OutreachTargetIdentityInput): string | null {
  return hostFromEmail(input.contactEmailNormalized ?? "");
}

function haystack(input: OutreachTargetIdentityInput): string {
  return [
    input.name,
    input.websiteUrl,
    input.contactUrl,
    input.listingWebsiteUrl,
    input.listingSourceUrl,
    input.listingName,
    input.formattedAddress,
    hostOf(input),
    emailHostOf(input),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isDirectoryHost(host: string | null | undefined): boolean {
  if (!host?.trim()) return false;
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (KNOWN_DIRECTORY_HOSTS.has(h)) return true;
  if ([...KNOWN_DIRECTORY_HOSTS].some((d) => h === d || h.endsWith(`.${d}`))) return true;
  if (isNonVenueEvidenceHost(h)) return true;
  if (MEDIA_HOST_RE.test(h) || MEDIA_HOST_GENERIC_RE.test(h) || CITY_CALENDAR_HOST_RE.test(h)) return true;
  return DIRECTORY_HOST_RE.test(h);
}

export function isDirectoryListingPath(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    return DIRECTORY_PATH_RE.test(path);
  } catch {
    return DIRECTORY_PATH_RE.test(url.toLowerCase());
  }
}

export function isStreetLikeAddress(address: string | null | undefined): boolean {
  if (!address?.trim()) return false;
  const a = address.trim();
  if (a.length < 10) return false;
  return STREET_ADDRESS_RE.test(a);
}

export function hasCrediblePlaceIdentity(input: OutreachTargetIdentityInput): boolean {
  if (!input.googlePlaceId?.trim()) return false;
  if (input.listingLat == null || input.listingLng == null) return false;
  const addr = input.formattedAddress?.trim() || "";
  if (!isStreetLikeAddress(addr)) return false;
  const name = (input.listingName || input.name || "").trim().toLowerCase();
  if (name && addr.toLowerCase() === name) return false;
  return true;
}

function isHomepageLikeOfficialUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (isDirectoryHost(u.hostname)) return false;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (isDirectoryListingPath(url)) return false;
    if (path === "/" || path === "") return true;
    return /^\/(home|index|contact|about|events?|calendar|music|comedy|open-?mic|visit|hours)?$/i.test(path);
  } catch {
    return false;
  }
}

function hasFirstPartyOfficialSite(input: OutreachTargetIdentityInput): boolean {
  const host = hostOf(input);
  if (!host || isDirectoryHost(host)) return false;
  const site = input.websiteUrl || input.listingWebsiteUrl;
  if (!site) return false;
  if (isDirectoryListingPath(site)) return false;
  return true;
}

function distinctiveNonGeoName(name: string): boolean {
  const rejection = classifyListingName(name);
  if (rejection === "AGGREGATOR_OR_DIRECTORY" || rejection === "ARTICLE_OR_LISTICLE" || rejection === "GENERIC_PAGE_TITLE") {
    return false;
  }
  const toks = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const geo = new Set([
    "dallas",
    "texas",
    "houston",
    "charlotte",
    "united",
    "states",
    "phoenix",
    "chicago",
    "national",
    "near",
  ]);
  return toks.some((t) => !geo.has(t) && t !== "the" && t !== "and");
}

function looksLikeDirectory(input: OutreachTargetIdentityInput): boolean {
  const host = hostOf(input);
  const emailHost = emailHostOf(input);
  if (isDirectoryHost(host) || isDirectoryHost(emailHost)) return true;
  if (isDirectoryListingPath(input.websiteUrl) || isDirectoryListingPath(input.listingWebsiteUrl) || isDirectoryListingPath(input.listingSourceUrl)) {
    return true;
  }
  const name = `${input.name} ${input.listingName || ""}`;
  const nameClass = classifyListingName(input.name);
  if (nameClass === "AGGREGATOR_OR_DIRECTORY" || nameClass === "ARTICLE_OR_LISTICLE") return true;
  if (GEO_LISTING_NAME_RE.test(name) || SEO_LISTICLE_NAME_RE.test(input.name)) return true;
  return false;
}

function looksLikeServiceCompany(input: OutreachTargetIdentityInput): boolean {
  return SERVICE_COMPANY_RE.test(haystack(input)) || SERVICE_COMPANY_RE.test(input.name);
}

function looksLikeChamber(input: OutreachTargetIdentityInput): boolean {
  if (CHAMBER_RE.test(haystack(input))) return true;
  const host = hostOf(input);
  if (host && /^(visit|explore|discover)[a-z0-9-]*\.(com|org|net)$/i.test(host)) return true;
  return false;
}

function promoterPositive(input: OutreachTargetIdentityInput): boolean {
  if (input.leadType === "PROMOTER_ACCOUNT" && hasFirstPartyOfficialSite(input) && !looksLikeDirectory(input) && !looksLikeServiceCompany(input)) {
    return distinctiveNonGeoName(input.name);
  }
  if (PROMOTER_NAME_RE.test(input.name) && hasFirstPartyOfficialSite(input) && isHomepageLikeOfficialUrl(input.websiteUrl)) {
    return !looksLikeDirectory(input) && !looksLikeServiceCompany(input);
  }
  return false;
}

const AMBIGUOUS_ORG_RE = /\b(entertainment|productions|events|company|llc|group|services|agency)\b/i;

function venuePositiveEvidence(input: OutreachTargetIdentityInput): { ok: boolean; summary: string } {
  const official = hasFirstPartyOfficialSite(input);
  const homepage = isHomepageLikeOfficialUrl(input.websiteUrl) || isHomepageLikeOfficialUrl(input.listingWebsiteUrl);
  const place = hasCrediblePlaceIdentity(input);
  const street = isStreetLikeAddress(input.formattedAddress);
  const venueName = VENUE_NAME_TOKEN_RE.test(input.name) || VENUE_NAME_TOKEN_RE.test(input.listingName || "");
  const nameOk = classifyListingName(input.name) == null && distinctiveNonGeoName(input.name);

  if (!official) return { ok: false, summary: "no first-party official website" };
  if (!nameOk) return { ok: false, summary: "name is not a venue identity" };

  if (place || street) {
    return { ok: true, summary: place ? "Place identity + official site" : "street address + official site" };
  }

  if (homepage && venueName && distinctiveNonGeoName(input.name)) {
    return { ok: true, summary: "official homepage + venue-type name" };
  }

  if (homepage && distinctiveNonGeoName(input.name) && !AMBIGUOUS_ORG_RE.test(input.name)) {
    return { ok: true, summary: "official homepage + distinctive venue name" };
  }

  if (venueName && (input.city || input.region)) {
    return { ok: false, summary: "venue-like name without Place/address/homepage" };
  }

  return { ok: false, summary: "insufficient physical/official venue evidence" };
}

export function classifyOutreachTargetIdentity(input: OutreachTargetIdentityInput): OutreachTargetClassification {
  if (looksLikeChamber(input)) {
    return {
      decision: "ineligible",
      identity: "UNKNOWN",
      rejectClass: "chamber_tourism",
      reason: "chamber_tourism",
      summary: "chamber/tourism identity",
      cta: null,
    };
  }

  if (looksLikeDirectory(input)) {
    return {
      decision: "ineligible",
      identity: "UNKNOWN",
      rejectClass: "directory",
      reason: "directory_aggregator",
      summary: "directory/listing/aggregator identity",
      cta: null,
    };
  }

  if (looksLikeServiceCompany(input)) {
    if (TALENT_OR_BOOKING_RE.test(haystack(input)) && !/\bdjs?\b/i.test(input.name)) {
      return {
        decision: "manual_review",
        identity: "UNKNOWN",
        rejectClass: null,
        reason: "needs_manual_review",
        summary: "talent/booking company — not auto-sent",
        cta: null,
      };
    }
    return {
      decision: "ineligible",
      identity: "UNKNOWN",
      rejectClass: "service_company",
      reason: "service_company",
      summary: "service vendor (DJ/planner/AV/etc), not a venue or promoter",
      cta: null,
    };
  }

  const host = hostOf(input);
  if (host && /(school|academy|conservatory|lessons)/.test(host) && !VENUE_NAME_TOKEN_RE.test(input.name)) {
    return {
      decision: "manual_review",
      identity: "UNKNOWN",
      rejectClass: null,
      reason: "needs_manual_review",
      summary: "school/academy host without venue identity",
      cta: null,
    };
  }

  if (promoterPositive(input)) {
    return {
      decision: "eligible_promoter",
      identity: "PROMOTER",
      rejectClass: null,
      reason: "eligible",
      summary: "official organizer identity",
      cta: "promoter",
    };
  }

  if (input.leadType === "PROMOTER_ACCOUNT") {
    return {
      decision: "manual_review",
      identity: "PROMOTER",
      rejectClass: null,
      reason: "needs_manual_review",
      summary: "promoter label without strong official-organizer evidence",
      cta: null,
    };
  }

  const venue = venuePositiveEvidence(input);
  if (venue.ok) {
    return {
      decision: "eligible_venue",
      identity: "VENUE",
      rejectClass: null,
      reason: "eligible",
      summary: venue.summary,
      cta: "venue",
    };
  }

  const nameClass = classifyListingName(input.name);
  if (nameClass === "AGGREGATOR_OR_DIRECTORY" || nameClass === "ARTICLE_OR_LISTICLE" || nameClass === "GENERIC_PAGE_TITLE") {
    return {
      decision: "ineligible",
      identity: "UNKNOWN",
      rejectClass: "weak_identity",
      reason: "weak_identity",
      summary: `listing name rejected (${nameClass})`,
      cta: null,
    };
  }

  const plausiblePhysical =
    isStreetLikeAddress(input.formattedAddress) ||
    hasCrediblePlaceIdentity(input) ||
    (VENUE_NAME_TOKEN_RE.test(input.name) && Boolean(input.city || input.region));

  if (!hasFirstPartyOfficialSite(input) && !plausiblePhysical) {
    return {
      decision: "ineligible",
      identity: "UNKNOWN",
      rejectClass: "weak_identity",
      reason: "weak_identity",
      summary: venue.summary,
      cta: null,
    };
  }

  return {
    decision: "manual_review",
    identity: "UNKNOWN",
    rejectClass: null,
    reason: "needs_manual_review",
    summary: venue.summary,
    cta: null,
  };
}

export function outreachTargetBlocksAutomation(c: OutreachTargetClassification): boolean {
  return c.decision !== "eligible_venue" && c.decision !== "eligible_promoter";
}
