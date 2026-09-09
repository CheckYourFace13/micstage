import * as cheerio from "cheerio";

import { isDirectoryHost, isDirectoryListingPath } from "@/lib/growth/outreachTargetIdentity";
import { classifyListingName } from "@/lib/publicListings/listingQuality";

/**
 * Turns a crawled search-result page into real venue candidates.
 *
 * A search result is an EVIDENCE SOURCE, not an identity. Directory and listicle pages must never
 * become the target lead; the venues they mention are extracted and resolved independently.
 */

export type VenueCandidateMethod =
  | "jsonld_business"
  | "jsonld_event_location"
  | "site_name"
  | "page_title"
  | "outbound_link"
  | "heading";

export type ExtractedVenueCandidate = {
  name: string;
  /** The venue's own site when the page revealed it (outbound link / JSON-LD url). */
  websiteUrl: string | null;
  city: string | null;
  region: string | null;
  streetAddress: string | null;
  method: VenueCandidateMethod;
  /** Page the candidate was found on (evidence, not identity). */
  sourceUrl: string;
  snippet: string | null;
};

export type PageRole = "first_party_venue" | "directory_or_article";

export type VenueCandidateExtraction = {
  pageRole: PageRole;
  pageRoleReason: string;
  candidates: ExtractedVenueCandidate[];
};

const BUSINESS_TYPES = new Set([
  "restaurant",
  "barorpub",
  "bar",
  "nightclub",
  "cafeorcoffeeshop",
  "coffeeshop",
  "brewery",
  "winery",
  "distillery",
  "localbusiness",
  "foodestablishment",
  "eventvenue",
  "musicvenue",
  "performingartstheater",
  "theater",
  "comedyclub",
  "place",
  "civicstructure",
  "entertainmentbusiness",
]);

/** Hosts that are never a venue's own site, so their links are evidence rather than identity. */
const NON_VENUE_LINK_HOST_RE =
  /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|youtu|linkedin|eventbrite|yelp|tripadvisor|meetup|allevents|bandsintown|songkick|ticketmaster|dice|opentable|resy|doordash|ubereats|grubhub|google|apple|maps|wikipedia|patreon|gofundme|paypal|venmo|spotify|soundcloud|bandcamp|mailchimp|squarespace|wordpress|wixsite|godaddy|shopify|linktr|meta|whatsapp|messenger|threads|snapchat|pinterest|reddit|discord|twitch|amazon|microsoft|openai|anthropic|substack|medium|blogspot|tumblr|vimeo|dropbox|zoom|stripe|square|toasttab|clover|yahoo|bing|duckduckgo)\.[a-z.]+$/i;

const ASSET_PATH_RE = /\.(png|jpe?g|gif|webp|svg|pdf|mp4|mp3|zip|css|js)(\?|$)/i;

const VENUE_NAME_TOKEN_RE =
  /\b(bar|pub|tavern|brewery|brewpub|taproom|alehouse|cafe|café|coffeehouse|coffee\s*house|restaurant|grill|grille|lounge|club|comedy\s*club|theater|theatre|hall|room|venue|winery|distillery|nightclub|music\s*hall|listening\s*room|arts?\s*center|playhouse|saloon|bistro|kitchen|eatery|roastery|speakeasy|cantina|pizzeria)\b/i;

/** "15 Best Bars", "10 Comedy Clubs" — a number only signals a listicle before a category word. */
const LISTICLE_TITLE_RE =
  /^\s*(the\s+)?\d{1,3}\s+(best|top|greatest|must|amazing|awesome|coolest|great|places|things|venues|bars|clubs|spots|reasons|ways|tips)\b|^\s*(the\s+)?(top|best|greatest|ultimate|complete|your|our)\s+\w|\b(round-?up|listicle|things to do|near me|in \d{4})\b/i;

/** Editorial phrasing that only appears in articles, never in a business name. */
const SENTENCE_TITLE_RE =
  /\b(taking advantage|how to|how you|why you|what to|where to|when to|should you|ways to|reasons|everything you|check out|read more|laugh it up|find the|guide to|a guide|tips for|tips to)\b/i;

/** Plural category nouns that make a name a category, not an identity. */
const CATEGORY_NOUN_RE =
  /\b(events?|venues?|bars?|restaurants?|clubs?|sessions?|nights?|mics?|shows?|jams?|spots?|places?|nightlife|listings?)\b/i;

/** "... in Denver", "... near Chicago" attached to a category noun is a directory heading. */
const GEO_PHRASE_RE = /\b(in|near|around|across|throughout)\s+[a-z]/i;

/** Publishers, associations and civic bodies are real places but never open-mic venues. */
const NON_VENUE_ORG_RE =
  /\b(sun-?times|tribune|herald|gazette|chronicle|dispatch|observer|times|post|magazine|journal|news(paper|room)?|media|broadcast|radio|television|podcast|press|publishing|blog)\b|\b(chamber|business\s+alliance|association|coalition|foundation|nonprofit|non-?profit|society|council|bureau|tourism|visitors?\s+center|convention|economic\s+development)\b/i;

/** "ComedyList", "OpenMicFinder", "GigGuide" — aggregator brands, not venues. */
const AGGREGATOR_BRAND_RE =
  /(comedy|mic|open|music|event|gig|show|venue|bar|club|jam|poetry|night)\w*(list|finder|directory|guide|hub|calendar|network|central|search)\b/i;

/** Tokens that carry no identity on their own. A name made only of these is a category. */
const GENERIC_NAME_TOKENS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "at", "on", "for", "to", "your", "our", "my", "with", "by",
  "near", "me", "best", "top", "new", "all", "more", "post", "submit", "add", "find", "list", "lists",
  "listing", "listings", "directory", "guide", "guides", "calendar", "events", "event", "venue", "venues",
  "restaurant", "restaurants", "night", "nights", "nightlife", "mic", "mics", "open", "live", "music",
  "comedy", "poetry", "jam", "jams", "session", "sessions", "show", "shows", "ticket", "tickets", "spot",
  "spots", "place", "places", "thing", "things", "do", "community", "public", "types", "type", "home",
  "page", "about", "contact", "info", "welcome", "city", "area", "downtown", "local", "us", "usa",
  "america", "weekly", "monthly", "tonight", "today", "karaoke", "standup", "stand", "up", "night's",
]);

/** True when something in the name could actually name a business. */
function hasDistinctiveToken(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((t) => !GENERIC_NAME_TOKENS.has(t) && !/^\d+$/.test(t));
}

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•|>»·]+/, "")
    .replace(/[\s\-–—•|<«·]+$/, "")
    .trim();
}

/** Splits "Venue Name | Best Bars in Austin" style titles down to the leading identity segment. */
function leadingTitleSegment(raw: string): string {
  const t = cleanName(raw);
  const cut = t.split(/\s*[|\u2013\u2014]\s*|\s+[-]\s+/)[0]?.trim() ?? t;
  return cut.slice(0, 120);
}

/**
 * A usable venue identity: survives the public listing-name classifier and is not a bare
 * generic word. This is the gate that stops "Post Your Open Mic" becoming a venue.
 */
export function isUsableVenueName(name: string | null | undefined): boolean {
  const n = cleanName(name ?? "");
  if (n.length < 3 || n.length > 120) return false;
  if (!/[a-z]/i.test(n)) return false;
  if (classifyListingName(n)) return false;

  const words = n.split(/\s+/);
  if (words.length > 12) return false;
  if (LISTICLE_TITLE_RE.test(n)) return false;
  if (SENTENCE_TITLE_RE.test(n)) return false;
  if (AGGREGATOR_BRAND_RE.test(n)) return false;
  if (NON_VENUE_ORG_RE.test(n)) return false;
  // "Open Jam Sessions in Denver" names a category in a city, not a business.
  if (CATEGORY_NOUN_RE.test(n) && GEO_PHRASE_RE.test(n)) return false;
  // SEO titles stack clauses; business names rarely do.
  if (n.includes(",") && words.length >= 4) return false;
  if (!hasDistinctiveToken(n)) return false;
  return true;
}

type JsonLdNode = Record<string, unknown>;

function jsonLdNodes($: cheerio.CheerioAPI): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      let guard = 0;
      while (stack.length && guard++ < 500) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        const obj = node as JsonLdNode;
        out.push(obj);
        if (Array.isArray(obj["@graph"])) stack.push(...(obj["@graph"] as unknown[]));
        for (const v of Object.values(obj)) {
          if (Array.isArray(v)) stack.push(...v);
          else if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return out;
}

function typesOf(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  return [];
}

function addressOf(node: JsonLdNode): { street: string | null; city: string | null; region: string | null } {
  const a = node.address;
  if (typeof a === "string") return { street: a.trim() || null, city: null, region: null };
  if (a && typeof a === "object") {
    const obj = a as JsonLdNode;
    const str = (k: string) => (typeof obj[k] === "string" ? (obj[k] as string).trim() || null : null);
    return { street: str("streetAddress"), city: str("addressLocality"), region: str("addressRegion") };
  }
  return { street: null, city: null, region: null };
}

function nodeUrl(node: JsonLdNode): string | null {
  for (const key of ["url", "sameAs", "mainEntityOfPage"]) {
    const v = node[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === "string" && /^https?:\/\//i.test(x));
      if (typeof first === "string") return first;
    }
  }
  return null;
}

function businessCandidatesFromJsonLd(nodes: JsonLdNode[], sourceUrl: string): ExtractedVenueCandidate[] {
  const out: ExtractedVenueCandidate[] = [];
  for (const node of nodes) {
    const types = typesOf(node);
    const isBusiness = types.some((t) => BUSINESS_TYPES.has(t));
    const isEvent = types.includes("event") || types.includes("musicevent") || types.includes("comedyevent");

    if (isBusiness) {
      const name = typeof node.name === "string" ? cleanName(node.name) : "";
      if (!isUsableVenueName(name)) continue;
      const addr = addressOf(node);
      out.push({
        name,
        websiteUrl: nodeUrl(node),
        city: addr.city,
        region: addr.region,
        streetAddress: addr.street,
        method: "jsonld_business",
        sourceUrl,
        snippet: null,
      });
      continue;
    }

    if (isEvent) {
      const loc = node.location;
      if (!loc || typeof loc !== "object") continue;
      const locObj = loc as JsonLdNode;
      const name = typeof locObj.name === "string" ? cleanName(locObj.name) : "";
      if (!isUsableVenueName(name)) continue;
      const addr = addressOf(locObj);
      out.push({
        name,
        websiteUrl: nodeUrl(locObj),
        city: addr.city,
        region: addr.region,
        streetAddress: addr.street,
        method: "jsonld_event_location",
        sourceUrl,
        snippet: typeof node.name === "string" ? cleanName(node.name).slice(0, 180) : null,
      });
    }
  }
  return out;
}

function outboundLinkCandidates(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  pageHost: string | null,
): ExtractedVenueCandidate[] {
  const out: ExtractedVenueCandidate[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("mailto:")) return;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/i.test(abs.protocol)) return;
    if (ASSET_PATH_RE.test(abs.pathname)) return;

    const linkHost = abs.hostname.replace(/^www\./i, "").toLowerCase();
    if (!linkHost || linkHost === pageHost) return;
    if (NON_VENUE_LINK_HOST_RE.test(linkHost)) return;
    if (isDirectoryHost(linkHost)) return;

    const text = cleanName($(el).text());
    if (!isUsableVenueName(text)) return;
    if (/\b(read|more|here|click|website|tickets?|info|details|directions|map|menu|home|login|sign\s?up)\b/i.test(text)) return;

    /**
     * Anchor text alone is weak: "Meta AI" would match a same-named business somewhere. Accept a
     * link only when it names a venue type, or when the destination domain is that same brand.
     */
    const brandKey = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hostBrand = linkHost.split(".").slice(0, -1).join("");
    const brandMatchesDomain = brandKey.length >= 6 && hostBrand.length >= 6 && (hostBrand.includes(brandKey) || brandKey.includes(hostBrand));
    if (!VENUE_NAME_TOKEN_RE.test(text) && !brandMatchesDomain) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      name: text,
      websiteUrl: `${abs.protocol}//${abs.host}/`,
      city: null,
      region: null,
      streetAddress: null,
      method: "outbound_link",
      sourceUrl: pageUrl,
      snippet: cleanName($(el).parent().text()).slice(0, 180) || null,
    });
  });

  return out;
}

function headingCandidates($: cheerio.CheerioAPI, pageUrl: string): ExtractedVenueCandidate[] {
  const out: ExtractedVenueCandidate[] = [];
  const seen = new Set<string>();
  $("h2, h3").each((_, el) => {
    let text = cleanName($(el).text());
    // "1. The Blue Note" / "3) Cactus Cafe"
    text = text.replace(/^\d{1,2}\s*[.)\]:-]\s*/, "");
    if (!isUsableVenueName(text)) return;
    if (!VENUE_NAME_TOKEN_RE.test(text)) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      name: text,
      websiteUrl: null,
      city: null,
      region: null,
      streetAddress: null,
      method: "heading",
      sourceUrl: pageUrl,
      snippet: null,
    });
  });
  return out;
}

function dedupeCandidates(list: ExtractedVenueCandidate[]): ExtractedVenueCandidate[] {
  const order: Record<VenueCandidateMethod, number> = {
    jsonld_business: 0,
    jsonld_event_location: 1,
    outbound_link: 2,
    site_name: 3,
    page_title: 4,
    heading: 5,
  };
  const best = new Map<string, ExtractedVenueCandidate>();
  for (const c of list) {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) continue;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, c);
      continue;
    }
    // Prefer the richer source, and keep any website/address the other copy supplied.
    const winner = order[c.method] < order[prev.method] ? { ...c } : { ...prev };
    winner.websiteUrl = winner.websiteUrl ?? prev.websiteUrl ?? c.websiteUrl;
    winner.city = winner.city ?? prev.city ?? c.city;
    winner.region = winner.region ?? prev.region ?? c.region;
    winner.streetAddress = winner.streetAddress ?? prev.streetAddress ?? c.streetAddress;
    best.set(key, winner);
  }
  return [...best.values()];
}

/**
 * Decides whether a crawled page IS a venue or merely TALKS ABOUT venues, and returns the real
 * venue candidates either way. Directory/listicle pages yield many candidates and never
 * contribute their own title as an identity.
 */
export function extractVenueCandidatesFromPage(input: {
  pageUrl: string;
  html: string;
  serpTitle?: string | null;
  maxCandidates?: number;
}): VenueCandidateExtraction {
  const { pageUrl, html } = input;
  const maxCandidates = input.maxCandidates ?? 12;
  const pageHost = hostOf(pageUrl);
  const $ = cheerio.load(html);
  const nodes = jsonLdNodes($);

  const jsonLdBusinesses = businessCandidatesFromJsonLd(nodes, pageUrl);
  const outbound = outboundLinkCandidates($, pageUrl, pageHost);
  const headings = headingCandidates($, pageUrl);

  const siteName = cleanName($('meta[property="og:site_name"]').attr("content") ?? "");
  const rawTitle = $("title").first().text() || $("h1").first().text() || "";
  const titleSegment = leadingTitleSegment(rawTitle);

  const directoryHost = isDirectoryHost(pageHost);
  const directoryPath = isDirectoryListingPath(pageUrl);
  const listicleTitle = LISTICLE_TITLE_RE.test(cleanName(rawTitle)) || LISTICLE_TITLE_RE.test(input.serpTitle ?? "");
  const manyVenueMentions = dedupeCandidates([...jsonLdBusinesses, ...outbound, ...headings]).length >= 3;

  let pageRole: PageRole = "first_party_venue";
  let pageRoleReason = "first_party_site";
  if (directoryHost) {
    pageRole = "directory_or_article";
    pageRoleReason = "directory_host";
  } else if (directoryPath) {
    pageRole = "directory_or_article";
    pageRoleReason = "directory_path";
  } else if (listicleTitle) {
    pageRole = "directory_or_article";
    pageRoleReason = "listicle_title";
  } else if (manyVenueMentions) {
    pageRole = "directory_or_article";
    pageRoleReason = "multiple_venue_mentions";
  }

  if (pageRole === "directory_or_article") {
    /**
     * The article itself is never an identity: only what it points at. That includes the
     * publisher's own JSON-LD, which would otherwise turn a newspaper into a venue.
     */
    const publisherKeys = new Set(
      [siteName, pageHost?.replace(/\.[a-z.]+$/, "") ?? "", ...(pageHost ? [pageHost] : [])]
        .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ""))
        .filter((s) => s.length >= 4),
    );
    const isPublisherSelf = (name: string) => {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return [...publisherKeys].some((p) => key === p || key.includes(p) || p.includes(key));
    };
    const candidates = dedupeCandidates([...jsonLdBusinesses, ...outbound, ...headings])
      .filter((c) => !isPublisherSelf(c.name))
      .slice(0, maxCandidates);
    return { pageRole, pageRoleReason, candidates };
  }

  // First-party site: the business's own declared identity wins over the page title.
  const selfCandidates: ExtractedVenueCandidate[] = [];
  const selfBusiness = jsonLdBusinesses[0];
  if (selfBusiness) {
    selfCandidates.push({ ...selfBusiness, websiteUrl: selfBusiness.websiteUrl ?? pageUrl });
  } else if (isUsableVenueName(siteName)) {
    selfCandidates.push({
      name: siteName,
      websiteUrl: pageUrl,
      city: null,
      region: null,
      streetAddress: null,
      method: "site_name",
      sourceUrl: pageUrl,
      snippet: null,
    });
  } else if (isUsableVenueName(titleSegment)) {
    selfCandidates.push({
      name: titleSegment,
      websiteUrl: pageUrl,
      city: null,
      region: null,
      streetAddress: null,
      method: "page_title",
      sourceUrl: pageUrl,
      snippet: null,
    });
  }

  return { pageRole, pageRoleReason, candidates: dedupeCandidates(selfCandidates).slice(0, maxCandidates) };
}
