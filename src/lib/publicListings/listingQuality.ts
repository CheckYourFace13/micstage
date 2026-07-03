/**
 * Listing-name quality gates for public open mic listings.
 *
 * These rules decide whether a scraped/imported listing name looks like a real
 * venue/event vs. an article, listicle, generic page title, or scraped
 * page-slug artifact. They are the shared brain for:
 *  - publish gating (src/lib/publicListings/publishGrowthLeadListing.ts)
 *  - public discovery filtering (src/lib/publicListings/queries.ts)
 *  - sitemap indexability (below)
 *  - the quarantine audit script (scripts/audit-public-open-mic-listings.mjs)
 *
 * IMPORTANT: keep the pattern list in sync with the duplicated copy in
 * scripts/audit-public-open-mic-listings.mjs (scripts cannot import TS).
 */

/** Machine-readable reason a name was rejected from public visibility. */
export type ListingNameRejection =
  | "TOO_SHORT"
  | "GENERIC_PAGE_TITLE"
  | "ARTICLE_OR_LISTICLE"
  | "NON_VENUE_TITLE"
  | "PATH_OR_URL_NAME";

/** Whole-name generic page titles (nav labels / scraped page chrome, not venues). */
const GENERIC_PAGE_TITLE =
  /^(write|events?|event\s+venue|stand|home(?:page)?|home-\d+|local\s+events|all\s+events|upcoming(?:\s+events)?|calendar|schedule|contact(?:\s+us)?|about(?:\s+us)?|menus?|hours|our\s+hours|directions|locations?|venues?|gallery|photos?|blog|news|faqs?|log\s?in|sign\s?in|sign\s?up|signup|register|search|tickets|buy\s+tickets|shop|store|privacy(?:\s+policy)?|terms(?:\s+of\s+service)?|page\s+not\s+found|not\s+found|404|error|coming\s+soon|under\s+construction|what'?s\s+on|book\s+now|reservations?|reserve|more\s+info|learn\s+more|read\s+more|click\s+here|untitled|default|sample\s+page|test|welcome|account\s+suspended|open\s?mic|open\s?mic\s+night)$/i;

/**
 * Listicle / number-led editorial titles ("10 Best...", "Top 12 Comedy Clubs...").
 * Careful not to flag venue names that merely start with a number followed by a
 * single venue noun ("400 Bar", "230 Club", "1904 Music Hall"): the collection
 * branch requires a trailing token, and the superlative branch needs an
 * editorial adjective right after the number.
 */
const LISTICLE =
  /(^\s*\d{1,3}\s*\+?\s+(best|top|great|amazing|fun|cheap|hidden|underrated|awesome|coolest|ultimate|things?|reasons?|ways?|ideas?)\b)|(^\s*\d{1,3}\s*\+?\s+(?:\S+\s+){0,6}(places?|venues?|clubs?|mics?|spots?|bars?|reasons?|ways?|ideas?|things?)\s+\S)|(^\s*(top|best)\s+\d{1,3}\b)|(\b\d{1,3}\s+(best|things\s+to\s+do|open\s?mics?|comedy\s+clubs?|live\s+music\s+venues?)\b)/i;

/**
 * Date-only / dated-article titles ("2019 Summer Guide", "03.01.2025", "Events for April 2026").
 * The trailing-year branch requires an event/listing word so real venues that
 * append their founding year ("Cocina and Beerhouse est. 2021") are preserved.
 */
const DATE_ARTICLE =
  /(^(19|20)\d{2}$)|(^(19|20)\d{2}\s+(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter|guide|events?|roundup|recap)\b)|(\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b)|(\b(events?|shows?|tickets?|schedule|calendar|concerts?|open\s?mic|line-?up|festival|nightlife)\b[\s\S]*\b(19|20)\d{2}$)|(^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$)|(^\d{1,2}[./]\d{1,2}[./]\d{2,4}\b)/i;

/** Non-venue editorial phrasing anywhere in the title. */
const EDITORIAL =
  /(\bthings\s+to\s+do\b)|(\bnight\s+of\s+laughs\b)|(\btour\s+of\s+comedy\b)|(\bbest\s+(live\s+music|bars|comedy|places|things)\b)|(\b(nightlife|city|bar|drink|dining|music|comedy|visitors?|travel|ultimate|summer|winter|spring|fall|autumn|holiday|weekend|seasonal|annual)\s+guide\b)|(\bguide\s*[:|-])|(\bguide\s+to\b)|(\bguide$)|(\bcalendar\b)|(\blive\s+music\s+calendar\b)|(\bconcerts?\s+(19|20)\d{2}\b)|(\b(19|20)\d{2}\s+schedule\b)|(\btop\s+ten\b)|(\btop\s+10\b)|(\blist\s+of\b)|(\bround-?up\b)|(\bthis\s+weekend\b)|(\bthis\s+week\b)|(\bnear\s+you\b)|(\bmust[-\s](see|visit|try)\b)|(\bmust-chicago\b)|(\bhow\s+to\b)|(\breview:)|(\brecap\b)|(\b(ways|reasons)\s+to\b)|(\bsoloing\s+wings\b)|(\bstretch\s+my\b)|(\bkaraoke\b)|(\btrivia\b)|(\bpub\s+trivia\b)|(\bbandmix\b)|(\bprivate\s+events\b)|(\blive\s+music\s+trail\b)/i;

/** Scraped URL / path-fragment / artifact names ("a/stir", "open-mic-night-3", "www.foo.com", "X :: Y", stray quotes). */
const PATH_OR_URL =
  /(:\/\/)|(\bwww\.)|(\.(com|net|org|io|co)\b)|(\.(html?|php|aspx?)\b)|(\/)|(::)|(")|(^[a-z0-9]+(?:-[a-z0-9]+)+$)/i;

/**
 * Classify a listing name. Returns a rejection reason, or `null` if the name
 * looks like a legitimate venue/event and may be shown publicly.
 */
export function classifyListingName(name: string): ListingNameRejection | null {
  const n = (name ?? "").trim();
  if (!n || n.length < 4) return "TOO_SHORT";
  if (GENERIC_PAGE_TITLE.test(n)) return "GENERIC_PAGE_TITLE";
  if (LISTICLE.test(n) || DATE_ARTICLE.test(n)) return "ARTICLE_OR_LISTICLE";
  if (PATH_OR_URL.test(n)) return "PATH_OR_URL_NAME";
  if (EDITORIAL.test(n)) return "NON_VENUE_TITLE";
  return null;
}

/** True when a listing name is acceptable for public discovery. */
export function isPublicListingNameOk(name: string): boolean {
  return classifyListingName(name) === null;
}

/**
 * Whether a public listing detail page (`/open-mics/[slug]`) should render at
 * all. Claimed listings are handled separately (redirected to the venue page).
 * OUTDATED (rejected/stale) and UNVERIFIED (undiscovered) rows, and junk-named
 * rows, are hidden entirely. NEEDS_REVIEW rows still render (noindexed, and
 * absent from every browse surface) so claim-invite recipients can reach them.
 */
export function isPublicListingRenderable(listing: {
  name: string;
  verificationStatus: string;
}): boolean {
  if (listing.verificationStatus === "OUTDATED" || listing.verificationStatus === "UNVERIFIED") {
    return false;
  }
  return isPublicListingNameOk(listing.name);
}

/** Whether a listing page should be indexed (has substance beyond a bare scraped title). */
export function listingIsPubliclyIndexable(listing: {
  name: string;
  verificationStatus: string;
  formattedAddress: string;
  city: string | null;
  schedules: unknown[];
  lastVerifiedAt: Date | null;
}): boolean {
  if (listing.verificationStatus !== "VERIFIED") return false;
  if (!isPublicListingNameOk(listing.name)) return false;
  const hasLocation = Boolean(listing.formattedAddress?.trim() || listing.city?.trim());
  if (!hasLocation) return false;
  return listing.schedules.length > 0 || listing.lastVerifiedAt != null;
}
