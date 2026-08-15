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
  | "AGGREGATOR_OR_DIRECTORY"
  | "CANCELLED_OR_CLOSED";

/**
 * Cancelled / closed / ended events must never become public VERIFIED inventory.
 * Prefer explicit cancellation language over bare "closed" (preserves venue names like "The Closed Door").
 */
const CANCELLED_OR_CLOSED =
  /\b(cancelled|canceled)\b|\bpermanently\s+closed\b|\bno\s+longer\s+(running|happening|active|hosting|taking\s+place)\b|\bfinal\s+night\b|\b(this\s+event\s+has\s+(been\s+)?(cancelled|canceled|ended|postponed))\b|^\s*(postponed|rescheduled)\s*:/i;

/** Whole-name generic page titles (nav labels / scraped page chrome, not venues). */
const GENERIC_PAGE_TITLE =
  /^(write|events?|event\s+venue|event\s+spaces?(?:\s*(?:&|and)\s*places?)?|events?\s+list|all\s+venues?|stand|home(?:\s*page)?|homepage|home-\d+|local\s+events|all\s+events|upcoming(?:\s+events)?|calendar|schedule|contact(?:\s+us)?|about(?:\s+us)?|about\s+\w+|menus?|hours|our\s+hours|directions|locations?|venues?|gallery|photos?|blog|news|faqs?|log\s?in|sign\s?in|sign\s?up|signup|register|search|tickets|buy\s+tickets|shop|store|privacy(?:\s+policy)?|terms(?:\s+of\s+service)?|page\s+not\s+found|not\s+found|404|error|coming\s+soon|under\s+construction|what'?s\s+on|book\s+now|reservations?|reserve|more\s+info|learn\s+more|read\s+more|click\s+here|untitled|default|sample\s+page|test|welcome|account\s+suspended|open\s?mic|open\s?mic\s+night|instagram|facebook|twitter|tiktok|youtube|linkedin|music|live|tonight|ticket|must|open|entertainment|bookings?|groups?|meetup|directory|category|private\s+events?|discovered\s+lead|singer|nightlife|the\s+nightlife)$/i;

/**
 * Exact junk tokens that are never a public open-mic identity (any casing).
 * Covers short words that would otherwise pass the minimum length check.
 */
const EXACT_JUNK_NAME = new Set(
  [
    "open",
    "must",
    "music",
    "live",
    "tonight",
    "calendar",
    "home",
    "welcome",
    "instagram",
    "facebook",
    "twitter",
    "tiktok",
    "youtube",
    "tickets",
    "ticket",
    "event",
    "events",
    "groups",
    "meetup",
    "entertainment",
    "bookings",
    "booking",
    "directory",
    "category",
    "storefm",
  ].map((s) => s.toLowerCase()),
);

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
  /(\bthings\s+to\s+do\b)|(\bnight\s+of\s+laughs\b)|(\btour\s+of\s+comedy\b)|(\bbest\s+(live\s+music|bars|comedy|places|things|private\s+event)\b)|(\bfind\s+the\s+best\b)|(\btop\s+(conference|summit|venues?|clubs?|bars?|spots?)\b)|(\blive\s+music\s*(?:&|and)\s*concerts?\b)|(\btickets?\s*(?:&|and)\s*schedule\b)|(\bevent\s+spaces?(?:\s*(?:&|and)\s*places?)?\b)|(\b(nightlife|city|bar|drink|dining|music|comedy|visitors?|travel|ultimate|summer|winter|spring|fall|autumn|holiday|weekend|seasonal|annual)\s+guide\b)|(\bguide\s*[:|-])|(\bguide\s+to\b)|(\bguide$)|(\bcalendar\b)|(\blive\s+music\s+calendar\b)|(\bconcerts?\s+(19|20)\d{2}\b)|(\b(19|20)\d{2}\s+schedule\b)|(\btop\s+ten\b)|(\btop\s+10\b)|(\blist\s+of\b)|(\bround-?up\b)|(\bthis\s+weekend\b)|(\bthis\s+week\b)|(\bnear\s+you\b)|(\bmust[-\s](see|visit|try)\b)|(\bmust-chicago\b)|(\bhow\s+to\b)|(\bhow\s+many\b)|(\bhow\s+\w[\w\s']{2,40}\s+still\b)|(\breview:)|(\brecap\b)|(\b(ways|reasons)\s+to\b)|(\bsoloing\s+wings\b)|(\bstretch\s+my\b)|(\bkaraoke\b)|(\btrivia\b)|(\bpub\s+trivia\b)|(\bbandmix\b)|(\bprivate\s+events?\b)|(\blive\s+music\s+trail\b)|(\byou\s+have\s+to\s+(experience|see|visit|try)\b)|(\bmusic\s+venues?\s+you\b)|(\btop\s+singers?\b)|(\bartist\s+booking\b)|(\bbooking\s+information\b)|(\bvenue\s+rental\b)|(\brent\s+(this\s+)?venue\b)|(\bentertainment\s+directory\b)|(\btourism\b)|(\bvisitors?\s+guide\b)|(\bwhere\s+to\b)|(\bour\s+picks\b)|(\bstep\s+on\s+the\s+stage\b)|(\blooking\s+for\s+live\s+music\b)|(\bcelebrate\s+poetry\b)|(\bnational\s+poetry\s+month\b)|(\bmeet\s+our\s+(song\s+)?creators?\b)|(\bfolk\s+and\s+acoustic\s+music\s*home\b)|(\bhosts?\s+open\s+mic\b[\s\S]*\braising\s+money\b)|(\bculture\s+is\s+prevention\b)|(\bsix\s+of\s+the\s+city'?s\s+best\b)|(\bmusic\s+festivals?\s*(?:&|and)\s*concerts?\b)|(\bshowcase\s+your\s+talent\b)|(\bi\s+wanna\b)|(\bi\s+want\s+to\b)|(\ball\s+posts?\b)|(\barchives?\b)|(\busing\s+\w+\s+at\s+an?\s+open\s+mic\b)|(\bmusic\s+venue\s+series\b)|(\bupcoming\s+events?\b)|(\bfilled\s+a\s+void\b)|(\bcolumnist\s+writes\b)|(\bnext\s+voices\b)|(\btap\s+comedians\b)|(\bpull\s+thirsty\b)|(\bwe\s+love\b)|(\ba\s+place\s+to\s+share\b)|(\bcatalog\s+of\b)|(\blocal\s+open\s+mic\b)|(\bcharms?\b)|(\bstill\s+shapes?\b)|(\bstill\s+have\s+reservations?\b)|(\brestaurants?\s+that\b)|(\bcomedy\s+tour\b)|(\ba\s+stage\s+for\s+all\b)|(\ba\s+community\s+for\s+everyone\b)|(\bexplore\s+\w[\w\s']{0,40}\s+open\b)|(\btake\s+a\s+crack\b)|(\bsome\s+of\s+these\b)|(\bchicago\s+all\b)|(\b(how|what|where|why|when|who)\b[\s\S]{0,80}\?\s*$)/i;

/** Exact generic page titles that are not venues even when they mention live music. */
const GENERIC_LIVE_MUSIC_TITLE =
  /^\s*(live\s+music\s+events?|live\s+music|music\s+venues?|artist\s+booking(?:\s+information)?|blues\s+jams?)\s*$/i;

/** Platform / ticket / meetup chrome that is not a venue open mic. */
const PLATFORM_OR_TICKET_FLUFF =
  /(\beventbrite\b)|(\btickets?,?\s+multiple\s+dates\b)|(\bfind\s+events?\s*(?:&|and)\s*groups?\b)|(\bevents?\s*(?:&|and)\s*groups?\b)|(\bmeetup\.com\b)|(\bfind\s+events?\s*(?:&|and)\s*groups?\s+in\b)|(\bmusic\s+tickets?\b)|(\bevents?\s*&\s*tickets?\b)|(\|\s*events?\s*&\s*tickets?\b)/i;

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
  /\bfind\s+open[\s-]?mi[ck]es?\b|\bopen[\s-]?mi[ck]es?\s+(?:near|around|in|by|across|throughout|of)\b|\bopen[\s-]?mic\s+nights?\s+(?:in|near|around|across)\b|\bopen[\s-]?mic\s+(?:venues?|events?|calendar|schedule|lists?|listings?|info|guide|directory|resources?|roundup)\b|\b(?:list|directory|calendar|guide|resource|roundup)\s+of\s+open[\s-]?mi[ck]es?\b|\bopen[\s-]?mi[ck]es?\s*(?:and|&)\s*jams?\b|\bopen[\s-]?mi[ck]es?\s+near\s+(?:me|you)\b/i;

/**
 * Article / landing-page / aggregator phrasing that disqualifies a name even
 * when it also carries an "at <venue>" fragment ("Open mic nights flourish at
 * South Evanston venues", "...Get on Stage Tonight!", "Arts Agenda: Open mics",
 * "Shows and Open Mics", "Boston Area Open Mics and Poetry Slams"). The plural
 * "open mics &/and ..." branches intentionally require the plural so real names
 * like "Live Music & Open Mic at The Wolf Cafe" are preserved.
 */
const AGGREGATOR_PHRASE =
  /(\bmeetup\s+group\b)|(\barts\s+agenda\b)|(\bget\s+on\s+stage\b)|(\bflourish\b)|(\bevery\s+night\b)|(\btonight\b)|(\bjoin\s+us\b)|(\bnavigating\b)|(\bwhere\s+and\s+when\b)|(\bmost\s+best\b)|(\bopen\s+mics\b\s*(?:&|and)\b)|(\b(?:and|&)\s+open\s+mics\b)|(\b(?:area|county|region|metro|greater)\s+open\s+mics?\b)|(\bopen\s+mics\b[\s\S]*\b(?:classes|slams|communities|directory|guides?|resources?|calendars?|roundup|support)\b)|(\bopen[\s-]?mics?\s+(?:nights?\s+)?(?:showcases?|highlights?|brings?|offers?|returns?|flourish(?:es)?|features?|celebrates?|draws?|attracts?)\b)|(\bshowcase\s+talent\s+in\b)|(\bruns?\s+a\s+free\b)|(\bopen\s+mic\s+in\s+its\b)/i;

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
  "madison", "evanston", "berwyn", "alsip", "doral", "decatur", "ballwin", "manchester", "twin", "cities",
  "north", "south", "east", "west", "saint", "st", "ft", "mount", "mt", "port", "bay", "grand", "city", "valley",
  "springs", "heights", "park", "beach", "hills", "township", "county", "downtown", "uptown", "midtown", "metro",
  "greater", "area", "village", "borough", "lake", "sf",
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

/** "Comedy Houston" / "Poetry Chicago" style city-scene shells (not "Comedy Bar"). */
function looksLikeGenreCityShell(name: string): boolean {
  const toks = tokenizeName(name);
  if (toks.length < 2 || toks.length > 4) return false;
  const genre = toks[0];
  if (!["comedy", "poetry", "music", "standup", "stand", "up"].includes(genre)) return false;
  // If any non-geo distinctive venue token remains after genre, keep it.
  for (const tok of toks.slice(1)) {
    if (AGG_GENERIC_TOKENS.has(tok)) continue;
    if (AGG_GEO_TOKENS.has(tok)) continue;
    return false;
  }
  return true;
}

/**
 * Classify a listing name. Returns a rejection reason, or `null` if the name
 * looks like a legitimate venue/event and may be shown publicly.
 */
export function classifyListingName(name: string): ListingNameRejection | null {
  const n = (name ?? "").trim();
  if (!n || n.length < 4) return "TOO_SHORT";
  if (EXACT_JUNK_NAME.has(n.toLowerCase())) return "GENERIC_PAGE_TITLE";
  // Single-token genre/chrome labels are not venue open mics.
  if (/^(poetry|comedy|jazz|blues|karaoke|trivia|music|live|events?|tickets?)$/i.test(n)) {
    return "GENERIC_PAGE_TITLE";
  }
  // Genre + directory noun / city scene pages — not "Music Box" / "Comedy Bar" venues.
  if (
    /^(comedy|poetry|music|standup|stand[\s-]?up)\s+(shows?|venues?|readings?|nights?|clubs?|events?|list|guide|calendar|scene)\b/i.test(
      n,
    )
  ) {
    return "AGGREGATOR_OR_DIRECTORY";
  }
  if (/^(comedy|poetry|music)\s+[a-z][a-z\s']+$/i.test(n) && looksLikeGenreCityShell(n)) {
    return "AGGREGATOR_OR_DIRECTORY";
  }
  if (/^[a-z][a-z\s']+\s+standup$/i.test(n) && !VENUE_IDENTITY.test(n)) {
    return "AGGREGATOR_OR_DIRECTORY";
  }
  // Incomplete scrape sentences ("Comedy Open Mic is held")
  if (/\bis\s+held\b/i.test(n) || /\btake\s+a\s+crack\b/i.test(n)) {
    return "NON_VENUE_TITLE";
  }
  if (CANCELLED_OR_CLOSED.test(n)) return "CANCELLED_OR_CLOSED";
  if (GENERIC_PAGE_TITLE.test(n)) return "GENERIC_PAGE_TITLE";
  if (GENERIC_LIVE_MUSIC_TITLE.test(n)) return "GENERIC_PAGE_TITLE";
  if (PLATFORM_OR_TICKET_FLUFF.test(n)) return "AGGREGATOR_OR_DIRECTORY";
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

export type PublicDisplayBucket = "GOOD" | "TITLE_CLEANUP" | "AMBIGUOUS" | "BAD";

export type PublicDisplayQuality = {
  bucket: PublicDisplayBucket;
  reason: string | null;
  /** Deterministic cleaned title when bucket is TITLE_CLEANUP (or GOOD after noop). */
  canonicalName: string | null;
};

/**
 * Strip ticket/platform/date fluff from a title when a venue-like core remains.
 * Returns null when cleanup is not safe/deterministic.
 */
export function suggestCanonicalListingName(name: string): string | null {
  let n = (name ?? "").trim();
  if (!n) return null;
  const original = n;

  n = n.replace(/\s*[|\u2013\u2014-]\s*Eventbrite\s*$/i, "");
  n = n.replace(/\s*Tickets?,?\s+Multiple\s+dates?\s*$/i, "");
  n = n.replace(/:?\s*Events?(?:\s*&\s*Tickets?)?\s*$/i, "");
  n = n.replace(/\s*Tickets?\s*$/i, "");
  n = n.replace(/\s*[|\u2013\u2014]\s*(Events?(?:\s*&\s*Tickets?)?|Live\s+Music|Calendar|Schedule|Entertainment|Private\s+Events?)\s*$/i, "");
  n = n.replace(/\s*\(\s*@[^)]+\)\s*$/g, "");
  n = n.replace(/\s*&\s*$/g, "");
  n = n.replace(/\s{2,}/g, " ").trim();
  // Drop trailing weekday/time crumbs: "Fri, Aug 14, 8:00 PM"
  n = n.replace(
    /,?\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+[A-Z][a-z]{2}\s+\d{1,2}(?:,?\s+\d{4})?(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?\s*$/i,
    "",
  );
  n = n.replace(/\s{2,}/g, " ").trim();

  if (!n || n.length < 5) return null;
  if (n.toLowerCase() === original.toLowerCase()) return null;
  if (classifyListingName(n) !== null) return null;
  // Require some venue-ish substance after cleanup
  if (/^(open\s*mic|open\s*mic\s+night)$/i.test(n)) return null;
  return n;
}

/**
 * Public display suitability — orthogonal to place/evidence VERIFIED status.
 * BAD → hide from discovery (quarantine). TITLE_CLEANUP → normalize name if safe.
 * AMBIGUOUS → human review (do not auto-hide). GOOD → public-ready.
 */
export function classifyPublicDisplayQuality(input: {
  name: string;
  city?: string | null;
  region?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
}): PublicDisplayQuality {
  const name = (input.name ?? "").trim();
  const reject = classifyListingName(name);
  if (reject) {
    const cleaned = suggestCanonicalListingName(name);
    if (cleaned) {
      return { bucket: "TITLE_CLEANUP", reason: reject, canonicalName: cleaned };
    }
    return { bucket: "BAD", reason: reject, canonicalName: null };
  }

  const place = [input.city, input.region].filter(Boolean).join(", ").trim();
  const hasPlace =
    Boolean(input.googlePlaceId) ||
    Boolean(place) ||
    Boolean(input.formattedAddress?.trim());

  // Bare titles with no geography and no place id are weak public inventory.
  if (!hasPlace && name.split(/\s+/).length <= 2 && !OPEN_MIC_NAME.test(name) && !VENUE_IDENTITY.test(name)) {
    return { bucket: "AMBIGUOUS", reason: "WEAK_GEO_IDENTITY", canonicalName: null };
  }

  const cleaned = suggestCanonicalListingName(name);
  if (cleaned) {
    return { bucket: "TITLE_CLEANUP", reason: "TITLE_FLUFF", canonicalName: cleaned };
  }

  return { bucket: "GOOD", reason: null, canonicalName: null };
}

/** Discovery / sitemap / claim-invite display gate (name quality). */
export function isPublicDisplayReady(name: string): boolean {
  const q = classifyPublicDisplayQuality({ name });
  return q.bucket === "GOOD" || (q.bucket === "TITLE_CLEANUP" && Boolean(q.canonicalName));
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
