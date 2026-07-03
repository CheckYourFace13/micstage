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
  | "PATH_OR_URL_NAME"
  | "AGGREGATOR_OR_DIRECTORY";

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
 * Aggregator / directory / bare city+open-mic names: "Open Mic Portland",
 * "Chicago Open Mics", "Open Mic Calendar", "Open Mic Comedy Night", "open mics
 * near me". These describe a list/landing page or a city's open-mic scene, not a
 * specific venue/event.
 *
 * A name is EXEMPT (treated as a real venue/event) when it carries a venue/host
 * identity: "at <venue>", "@ <venue>", "presented by <org>", "hosted by <host>",
 * "featuring <name>", or a possessive ("Cole's Comedy Open Mic"); or when a
 * distinctive (non-city, non-generic) token remains after the open-mic wording.
 *
 * IMPORTANT: keep OPEN_MIC_NAME / VENUE_IDENTITY / OPEN_MIC_DIRECTORY and the
 * AGG_* token sets in sync with scripts/lib/listingNameClassifier.mjs.
 */
const OPEN_MIC_NAME = /\bopen[\s-]?mics?\b|\bopen[\s-]?mikes?\b|\bopen\s+jams?\b|\bopen\s+stage\b|\bjam\s+night\b/i;

const VENUE_IDENTITY =
  /(\bat\s+[a-z0-9])|@|(\bpresented\s+by\b)|(\bhosted\s+by\b)|(\bfeat(?:uring)?\.?\s+[a-z])|([a-z](?:'|\u2019)s\b)|(\bw\/\s*[a-z])/i;

const OPEN_MIC_DIRECTORY =
  /\bfind\s+open[\s-]?mics?\b|\bopen[\s-]?mics?\s+(?:near|around|in|by|across|throughout|of)\b|\bopen[\s-]?mic\s+nights?\s+(?:in|near|around|across)\b|\bopen[\s-]?mic\s+(?:venues?|events?|calendar|schedule|lists?|listings?|info|guide|directory|resources?|roundup)\b|\b(?:list|directory|calendar|guide|resource|roundup)\s+of\s+open[\s-]?mics?\b|\bopen[\s-]?mics?\s*(?:and|&)\s*jams?\b|\bopen[\s-]?mics?\s+near\s+(?:me|you)\b/i;

/**
 * Article / landing-page / aggregator phrasing that disqualifies a name even
 * when it also carries an "at <venue>" fragment ("Open mic nights flourish at
 * South Evanston venues", "...Get on Stage Tonight!", "Arts Agenda: Open mics",
 * "Shows and Open Mics", "Boston Area Open Mics and Poetry Slams"). The plural
 * "open mics &/and ..." branches intentionally require the plural so real names
 * like "Live Music & Open Mic at The Wolf Cafe" are preserved.
 */
const AGGREGATOR_PHRASE =
  /(\bmeetup\s+group\b)|(\barts\s+agenda\b)|(\bget\s+on\s+stage\b)|(\bflourish\b)|(\bevery\s+night\b)|(\btonight\b)|(\bjoin\s+us\b)|(\bnavigating\b)|(\bwhere\s+and\s+when\b)|(\bmost\s+best\b)|(\bopen\s+mics\b\s*(?:&|and)\b)|(\b(?:and|&)\s+open\s+mics\b)|(\b(?:area|county|region|metro|greater)\s+open\s+mics?\b)|(\bopen\s+mics\b[\s\S]*\b(?:classes|slams|communities|directory|guides?|resources?|calendars?|roundup|support)\b)|(\bopen[\s-]?mics?\s+(?:nights?\s+)?(?:showcases?|highlights?|brings?|offers?|returns?|flourish(?:es)?|features?|celebrates?|draws?|attracts?)\b)|(\bshowcase\s+talent\s+in\b)/i;

/** Open-mic wording, performance categories, filler, and directory words — never distinctive on their own. */
const AGG_GENERIC_TOKENS = new Set([
  "open", "mic", "mics", "mike", "mikes", "jam", "jams", "stage", "stages", "night", "nights", "signup", "sign", "up",
  "comedy", "poetry", "music", "musical", "acoustic", "spoken", "word", "words", "standup", "stand", "songwriter",
  "songwriters", "songwriters'", "variety", "showcase", "performance", "performances", "performers", "performer",
  "artist", "artists", "singer", "singers", "musicians", "musician", "poet", "poets", "comedian", "comedians",
  "writers", "writer",
  "the", "a", "an", "and", "of", "for", "in", "on", "to", "with", "by", "at", "or", "your", "our", "my", "this",
  "all", "every", "weekly", "monthly", "biweekly", "daily", "nightly", "free", "live", "new",
  "list", "lists", "listing", "listings", "info", "information", "directory", "guide", "guides", "calendar",
  "calendars", "resource", "resources", "roundup", "schedule", "schedules", "near", "me", "you", "find", "finder",
  "events", "event", "venue", "venues", "around", "nearby", "upcoming", "best", "top", "featured",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/** US states, abbreviations, common city tokens, and geo modifiers. */
const AGG_GEO_TOKENS = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "hampshire", "jersey", "mexico", "york", "carolina", "dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode", "island", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "wisconsin", "wyoming",
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "ia", "ks", "ky", "la", "md", "ma",
  "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "pa", "ri", "sc", "sd", "tn",
  "tx", "ut", "vt", "va", "wa", "wi", "wv", "wy", "dc", "nyc", "usa", "us", "ok",
  "angeles", "los", "chicago", "houston", "phoenix", "philadelphia", "philly", "antonio", "san", "diego", "dallas",
  "austin", "jose", "fort", "worth", "columbus", "charlotte", "indianapolis", "seattle", "denver", "boston",
  "nashville", "detroit", "portland", "memphis", "vegas", "las", "louisville", "baltimore", "milwaukee",
  "albuquerque", "tucson", "fresno", "sacramento", "mesa", "atlanta", "omaha", "raleigh", "miami", "oakland",
  "minneapolis", "tulsa", "tampa", "orleans", "wichita", "cleveland", "bakersfield", "aurora", "anaheim", "honolulu",
  "pittsburgh", "cincinnati", "orlando", "jacksonville", "louis", "paul", "salt", "brooklyn", "bronx", "queens",
  "manhattan", "harlem", "asheville", "savannah", "charleston", "richmond", "norfolk", "dayton", "akron", "toledo",
  "madison", "evanston", "berwyn", "alsip", "doral", "decatur", "ballwin", "manchester",
  "north", "south", "east", "west", "saint", "st", "ft", "mount", "mt", "port", "bay", "grand", "city", "valley",
  "springs", "heights", "park", "beach", "hills", "township", "county", "downtown", "uptown", "midtown", "metro",
  "greater", "area", "village", "hollywood", "lake",
]);

function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9'\u2019\s-]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * True when an open-mic-type name has no venue/host identity and reads like a
 * directory/list/calendar or a bare city/state landing ("Open Mic Portland").
 */
function looksLikeOpenMicAggregator(name: string): boolean {
  if (!OPEN_MIC_NAME.test(name)) return false;
  if (VENUE_IDENTITY.test(name)) return false;
  if (OPEN_MIC_DIRECTORY.test(name)) return true;
  for (const tok of tokenizeName(name)) {
    if (AGG_GENERIC_TOKENS.has(tok)) continue;
    if (AGG_GEO_TOKENS.has(tok)) continue;
    return false; // a distinctive (venue/host) token remains
  }
  return true; // everything is open-mic wording + geo/generic → aggregator
}

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
  if (AGGREGATOR_PHRASE.test(n)) return "AGGREGATOR_OR_DIRECTORY";
  if (looksLikeOpenMicAggregator(n)) return "AGGREGATOR_OR_DIRECTORY";
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
