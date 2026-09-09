/**
 * Host/organizer identity gate for the host outreach lane.
 *
 * The venue lane already learned that a crawled page is EVIDENCE, not an identity
 * (see `isUsableVenueName` in discovery/venueCandidateExtraction). Hosts need the same rigor with
 * different positives: a host is an organizer, producer, collective, recurring series brand, or a
 * named person — never an article headline, a publisher, a nav label, or a bare social handle.
 */
import {
  cleanExtractedName,
  looksLikeAggregatorBrandName,
  looksLikeEditorialTitleName,
} from "@/lib/growth/discovery/venueCandidateExtraction";
import { classifyListingName } from "@/lib/publicListings/listingQuality";
import { isDirectoryHost } from "@/lib/growth/outreachTargetIdentity";

export type HostNameRejection =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "NOT_A_NAME"
  | "LISTING_NAME_REJECTED"
  | "EDITORIAL_OR_PUBLISHER"
  | "PUBLISHER_OR_CIVIC_ORG"
  | "DIRECTORY_BRAND"
  | "GENERIC_HOST_LABEL"
  | "SOCIAL_HANDLE"
  | "SENTENCE_LIKE"
  | "NO_DISTINCTIVE_TOKEN";

/**
 * Publishers, civic bodies and unrelated industries. This is the venue lane's `NON_VENUE_ORG_RE`
 * minus the promoter-shaped words: a host genuinely is "X Productions", "X Entertainment Group"
 * or a talent/management company, so those must stay allowed here.
 */
const PUBLISHER_OR_CIVIC_RE =
  /\b(sun-?times|tribune|herald|gazette|chronicle|dispatch|observer|magazine|journal|news(paper|room)?|media|broadcast|radio|television|podcast|press|publishing|blog)\b|\b(chamber|business\s+alliance|association|coalition|foundation|nonprofit|non-?profit|society|council|bureau|tourism|visitors?\s+center|convention|economic\s+development)\b|\b(marketing|advertising|realty|real\s+estate|insurance|law\s+(firm|offices?)|attorneys?|dental|orthodont\w*|clinic|hospital|bank|credit\s+union|staffing|consulting|logistics|construction)\b/i;

/** Aggregator/editorial brands whose words are spaced out ("Austin Music Guide"). */
const DIRECTORY_BRAND_RE =
  /\b(guides?|lists?|listings?|finders?|directory|directories|calendars?|roundups?|round-?ups?|reviews?|zine|newsletter|near\s+me)\b/i;

/** A pasted URL is a source, not an identity. */
const URL_LIKE_RE = /^(https?:\/\/|www\.)|\.(com|net|org|io|co|us|info|biz)(\/|$)/i;

/** Labels that appear where a host name should be, but name nobody. */
const GENERIC_HOST_LABEL_RE =
  /^(the\s+|your\s+|our\s+|my\s+)?(host|hosts|hosted\s+by|co-?hosts?|mc|emcee|host\s+name|name|open\s+mic|open\s+mics|open\s+mic\s+night|mic\s+night|open\s+stage|open\s+jam|jam\s+night|comedy\s+night|poetry\s+night|sign\s?up|sign\s?ups|signups?\s+sheet|list|lineup|line-?up|tba|tbd|n\/?a|none|staff|team|management|manager|admin|guest|guests|performer|performers|comedian|comedians|musician|musicians|artist|artists|everyone|anyone|all|various|various\s+artists|volunteer|volunteers|organizer|organizers|organiser|producer|producers|promoter|promoters|presenter|presenters|more\s+info|details|info|home|homepage|about|about\s+us|contact|contact\s+us|us|we|you|tickets?|events?|calendar|schedule|venue|venues|bar|club|stage|music|comedy|poetry|karaoke|entertainment|productions?|presents)$/i;

/** Editorial/sentence phrasing: a brand never says "will be", "check out", "you can". */
const SENTENCE_HOST_RE =
  /\b(is|are|was|were|will|would|can|could|should|has|have|had|does|do|did|join|check|read|click|learn|find|sign|bring|come|get|see|visit|book|call|email|follow|hosted|hosting|presenting|starts?|begins?|happens?|takes?\s+place|every|each)\b\s+\b/i;

/**
 * Host words that carry no identity on their own. A name made only of these is a category
 * ("Open Mic Night"), not an organizer.
 */
const GENERIC_HOST_TOKENS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "at", "on", "for", "to", "your", "our", "my", "with", "by",
  "presents", "present", "presented", "presenting", "production", "productions", "produced", "produces",
  "host", "hosts", "hosted", "hosting", "mc", "emcee", "organizer", "organizers", "organiser", "organised",
  "organized", "producer", "producers", "promoter", "promoters", "promotions", "promo", "presenter",
  "open", "mic", "mics", "mike", "mikes", "night", "nights", "nightly", "weekly", "monthly", "biweekly",
  "jam", "jams", "stage", "stages", "session", "sessions", "showcase", "showcases", "show", "shows",
  "comedy", "standup", "stand", "up", "poetry", "spoken", "word", "music", "musical", "acoustic",
  "songwriter", "songwriters", "singer", "singers", "variety", "live", "free", "new", "all", "every",
  "event", "events", "calendar", "schedule", "signup", "sign", "list", "lineup", "series", "collective",
  "company", "co", "inc", "llc", "ltd", "group", "team", "crew", "family", "presentation",
  "entertainment", "entertainments", "media", "official", "page", "home", "about", "contact", "info",
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True when something in the name could actually name an organizer. */
function hasDistinctiveHostToken(name: string): boolean {
  return tokens(name).some((t) => !GENERIC_HOST_TOKENS.has(t) && !/^\d+$/.test(t));
}

/** "@mikesopenmic", "mikes_open_mic" — a platform handle, not a resolvable identity. */
function looksLikeSocialHandle(name: string): boolean {
  const n = name.trim();
  if (n.startsWith("@")) return true;
  if (/^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(n) && !/\s/.test(n)) return true;
  return false;
}

/**
 * Classify a candidate host name. Returns a rejection reason, or `null` when the name is a usable
 * organizer/producer/brand/person identity.
 */
export function classifyHostName(raw: string | null | undefined): HostNameRejection | null {
  const n = cleanExtractedName(raw);
  if (n.length < 4) return "TOO_SHORT";
  if (n.length > 90) return "TOO_LONG";
  if (!/[a-z]/i.test(n)) return "NOT_A_NAME";

  const words = n.split(/\s+/);
  if (words.length > 8) return "TOO_LONG";

  if (URL_LIKE_RE.test(n)) return "NOT_A_NAME";
  if (GENERIC_HOST_LABEL_RE.test(n)) return "GENERIC_HOST_LABEL";
  if (looksLikeSocialHandle(n)) return "SOCIAL_HANDLE";
  if (looksLikeEditorialTitleName(n) || looksLikeAggregatorBrandName(n)) return "EDITORIAL_OR_PUBLISHER";
  if (PUBLISHER_OR_CIVIC_RE.test(n)) return "PUBLISHER_OR_CIVIC_ORG";
  if (DIRECTORY_BRAND_RE.test(n)) return "DIRECTORY_BRAND";
  if (classifyListingName(n)) return "LISTING_NAME_REJECTED";
  if (SENTENCE_HOST_RE.test(n)) return "SENTENCE_LIKE";
  // SEO titles stack clauses; organizer names rarely do.
  if (n.includes(",") && words.length >= 4) return "SENTENCE_LIKE";
  if (!hasDistinctiveHostToken(n)) return "NO_DISTINCTIVE_TOKEN";
  return null;
}

export function isUsableHostName(raw: string | null | undefined): boolean {
  return classifyHostName(raw) === null;
}

/**
 * Grouping key for "the same host brand seen at several venues". A leading article is dropped so
 * "The Laugh Circuit" and "Laugh Circuit" are one brand.
 */
export function normalizeHostBrandKey(raw: string | null | undefined): string {
  return cleanExtractedName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

function compactKey(raw: string | null | undefined): string {
  return normalizeHostBrandKey(raw).replace(/\s+/g, "");
}

/** Two names refer to the same identity when one contains the other. */
export function hostNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = compactKey(a);
  const y = compactKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  if (shorter.length < 5) return false;
  return longer.includes(shorter);
}

/**
 * A host brand must be distinct from the venue it was found at, otherwise "Green Mill Open Mic"
 * becomes a second lead for the venue we already have.
 */
export function hostNameDuplicatesVenue(
  hostName: string | null | undefined,
  venueName: string | null | undefined,
): boolean {
  return hostNamesMatch(hostName, venueName);
}

/**
 * A person-like name ("Jane Smith") is only an identity when something on the page says she runs
 * the mic; on its own it is just a name in a list of performers.
 */
export function looksLikePersonHostName(raw: string | null | undefined): boolean {
  const n = cleanExtractedName(raw);
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  if (!words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w))) return false;
  return tokens(n).every((t) => !GENERIC_HOST_TOKENS.has(t));
}

/** A crawlable first-party URL: enrichment can only mine a domain-matching mailbox from one. */
export function isMineableHostUrl(url: string | null | undefined): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(u.protocol)) return false;
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (!host.includes(".")) return false;
  // Directories and social platforms never yield a host-owned mailbox on their own domain.
  if (isDirectoryHost(host)) return false;
  if (
    /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|youtu|linkedin|reddit|threads|snapchat|pinterest|discord|twitch|linktr|patreon|gofundme|paypal|venmo|spotify|soundcloud|bandcamp|substack|medium|blogspot|tumblr|wordpress|wixsite|squarespace|google|apple|maps|wikipedia)\.[a-z.]+$/i.test(
      host,
    )
  ) {
    return false;
  }
  return true;
}
