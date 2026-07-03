/**
 * Plain-JS mirror of src/lib/publicListings/listingQuality.ts so that Node
 * scripts (which cannot import TS) share ONE listing-name classifier.
 *
 * IMPORTANT: keep this in exact sync with src/lib/publicListings/listingQuality.ts.
 */

const GENERIC_PAGE_TITLE =
  /^(write|events?|event\s+venue|stand|home(?:page)?|home-\d+|local\s+events|all\s+events|upcoming(?:\s+events)?|calendar|schedule|contact(?:\s+us)?|about(?:\s+us)?|menus?|hours|our\s+hours|directions|locations?|venues?|gallery|photos?|blog|news|faqs?|log\s?in|sign\s?in|sign\s?up|signup|register|search|tickets|buy\s+tickets|shop|store|privacy(?:\s+policy)?|terms(?:\s+of\s+service)?|page\s+not\s+found|not\s+found|404|error|coming\s+soon|under\s+construction|what'?s\s+on|book\s+now|reservations?|reserve|more\s+info|learn\s+more|read\s+more|click\s+here|untitled|default|sample\s+page|test|welcome|account\s+suspended|open\s?mic|open\s?mic\s+night)$/i;

const LISTICLE =
  /(^\s*\d{1,3}\s*\+?\s+(best|top|great|amazing|fun|cheap|hidden|underrated|awesome|coolest|ultimate|things?|reasons?|ways?|ideas?)\b)|(^\s*\d{1,3}\s*\+?\s+(?:\S+\s+){0,6}(places?|venues?|clubs?|mics?|spots?|bars?|reasons?|ways?|ideas?|things?)\s+\S)|(^\s*(top|best)\s+\d{1,3}\b)|(\b\d{1,3}\s+(best|things\s+to\s+do|open\s?mics?|comedy\s+clubs?|live\s+music\s+venues?)\b)/i;

const DATE_ARTICLE =
  /(^(19|20)\d{2}$)|(^(19|20)\d{2}\s+(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter|guide|events?|roundup|recap)\b)|(\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b)|(\b(events?|shows?|tickets?|schedule|calendar|concerts?|open\s?mic|line-?up|festival|nightlife)\b[\s\S]*\b(19|20)\d{2}$)|(^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$)|(^\d{1,2}[./]\d{1,2}[./]\d{2,4}\b)/i;

const EDITORIAL =
  /(\bthings\s+to\s+do\b)|(\bnight\s+of\s+laughs\b)|(\btour\s+of\s+comedy\b)|(\bbest\s+(live\s+music|bars|comedy|places|things)\b)|(\b(nightlife|city|bar|drink|dining|music|comedy|visitors?|travel|ultimate|summer|winter|spring|fall|autumn|holiday|weekend|seasonal|annual)\s+guide\b)|(\bguide\s*[:|-])|(\bguide\s+to\b)|(\bguide$)|(\bcalendar\b)|(\blive\s+music\s+calendar\b)|(\bconcerts?\s+(19|20)\d{2}\b)|(\b(19|20)\d{2}\s+schedule\b)|(\btop\s+ten\b)|(\btop\s+10\b)|(\blist\s+of\b)|(\bround-?up\b)|(\bthis\s+weekend\b)|(\bthis\s+week\b)|(\bnear\s+you\b)|(\bmust[-\s](see|visit|try)\b)|(\bmust-chicago\b)|(\bhow\s+to\b)|(\breview:)|(\brecap\b)|(\b(ways|reasons)\s+to\b)|(\bsoloing\s+wings\b)|(\bstretch\s+my\b)|(\bkaraoke\b)|(\btrivia\b)|(\bpub\s+trivia\b)|(\bbandmix\b)|(\bprivate\s+events\b)|(\blive\s+music\s+trail\b)/i;

const PATH_OR_URL =
  /(:\/\/)|(\bwww\.)|(\.(com|net|org|io|co)\b)|(\.(html?|php|aspx?)\b)|(\/)|(::)|(")|(^[a-z0-9]+(?:-[a-z0-9]+)+$)/i;

const OPEN_MIC_NAME = /\bopen[\s-]?mics?\b|\bopen[\s-]?mikes?\b|\bopen\s+jams?\b|\bopen\s+stage\b|\bjam\s+night\b/i;

const VENUE_IDENTITY =
  /(\bat\s+[a-z0-9])|@|(\bpresented\s+by\b)|(\bhosted\s+by\b)|(\bfeat(?:uring)?\.?\s+[a-z])|([a-z](?:'|\u2019)s\b)|(\bw\/\s*[a-z])/i;

const OPEN_MIC_DIRECTORY =
  /\bfind\s+open[\s-]?mics?\b|\bopen[\s-]?mics?\s+(?:near|around|in|by|across|throughout|of)\b|\bopen[\s-]?mic\s+nights?\s+(?:in|near|around|across)\b|\bopen[\s-]?mic\s+(?:venues?|events?|calendar|schedule|lists?|listings?|info|guide|directory|resources?|roundup)\b|\b(?:list|directory|calendar|guide|resource|roundup)\s+of\s+open[\s-]?mics?\b|\bopen[\s-]?mics?\s*(?:and|&)\s*jams?\b|\bopen[\s-]?mics?\s+near\s+(?:me|you)\b/i;

const AGGREGATOR_PHRASE =
  /(\bmeetup\s+group\b)|(\barts\s+agenda\b)|(\bget\s+on\s+stage\b)|(\bflourish\b)|(\bevery\s+night\b)|(\btonight\b)|(\bjoin\s+us\b)|(\bnavigating\b)|(\bwhere\s+and\s+when\b)|(\bmost\s+best\b)|(\bopen\s+mics\b\s*(?:&|and)\b)|(\b(?:and|&)\s+open\s+mics\b)|(\b(?:area|county|region|metro|greater)\s+open\s+mics?\b)|(\bopen\s+mics\b[\s\S]*\b(?:classes|slams|communities|directory|guides?|resources?|calendars?|roundup|support)\b)|(\bopen[\s-]?mics?\s+(?:nights?\s+)?(?:showcases?|highlights?|brings?|offers?|returns?|flourish(?:es)?|features?|celebrates?|draws?|attracts?)\b)|(\bshowcase\s+talent\s+in\b)/i;

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

function tokenizeName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9'\u2019\s-]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function looksLikeOpenMicAggregator(name) {
  if (!OPEN_MIC_NAME.test(name)) return false;
  if (VENUE_IDENTITY.test(name)) return false;
  if (OPEN_MIC_DIRECTORY.test(name)) return true;
  for (const tok of tokenizeName(name)) {
    if (AGG_GENERIC_TOKENS.has(tok)) continue;
    if (AGG_GEO_TOKENS.has(tok)) continue;
    return false;
  }
  return true;
}

/** Returns a rejection reason string, or null when the name is public-quality. */
export function classifyListingName(name) {
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

export function isPublicListingNameOk(name) {
  return classifyListingName(name) === null;
}
