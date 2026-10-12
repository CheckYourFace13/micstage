/**
 * Evidence trust evaluation for enrichment / promotion.
 * Official-domain hosting alone is never sufficient for trusted promotion.
 */
export const LISTING_EVIDENCE_REASON = {
  OFFICIAL_RECURRING_EVENT: "OFFICIAL_RECURRING_EVENT",
  OFFICIAL_CURRENT_EVENT: "OFFICIAL_CURRENT_EVENT",
  OFFICIAL_HISTORICAL_ONLY: "OFFICIAL_HISTORICAL_ONLY",
  OFFICIAL_AMBIGUOUS_MENTION: "OFFICIAL_AMBIGUOUS_MENTION",
  OFFICIAL_CANCELLED_EVENT: "OFFICIAL_CANCELLED_EVENT",
  SOCIAL_CURRENT_EVENT: "SOCIAL_CURRENT_EVENT",
  SOCIAL_AMBIGUOUS: "SOCIAL_AMBIGUOUS",
  THIRD_PARTY_STRUCTURED_CURRENT: "THIRD_PARTY_STRUCTURED_CURRENT",
  RAW_SNIPPET_ONLY: "RAW_SNIPPET_ONLY",
  PLACE_OR_REGION_CONFLICT: "PLACE_OR_REGION_CONFLICT",
  NO_TRUSTED_EVIDENCE: "NO_TRUSTED_EVIDENCE",
  NO_EXPLICIT_PHRASE: "NO_EXPLICIT_PHRASE",
} as const;

export type ListingEvidenceReasonCode =
  (typeof LISTING_EVIDENCE_REASON)[keyof typeof LISTING_EVIDENCE_REASON];

const EXPLICIT_RE =
  /\b(open\s*mic|open\s*mike|open\s*jam|open\s*stage|comedy\s*open\s*mic|poetry\s*open\s*mic)\b/i;

const CANCELLED_RE =
  /\b(cancelled|canceled|permanently\s+closed|no\s+longer\s+(?:running|happening|taking\s+place)|final\s+night|postponed\s+indefinitely|ended\s+in\s+20\d{2}|last\s+show\s+was)\b/i;

const HISTORICAL_RE =
  /\b(archive|archived|looking\s+back|in\s+20(0\d|1\d|2[0-3])\b|formerly|used\s+to\s+(?:host|run)|past\s+events?)\b/i;

const RECURRING_RE =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|each\s+week)\b/i;

const CURRENT_RE =
  /\b(tonight|this\s+week|upcoming|doors\s+at|sign[\s-]?ups?\s+(?:start|open)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|20(2[5-9]|3\d))\b/i;

export function excerptAroundMatch(text: string, max = 280): string | null {
  const m = EXPLICIT_RE.exec(text);
  if (!m || m.index == null) return null;
  const start = Math.max(0, m.index - 80);
  const end = Math.min(text.length, m.index + m[0].length + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, max);
}

export function detectExplicitPhrase(text: string): string | null {
  return EXPLICIT_RE.exec(text)?.[0] ?? null;
}

/** Ticket/directory hosts are never an official venue website for evidence trust. */
const NON_VENUE_EVIDENCE_HOSTS = [
  "ticketnetwork.com",
  "ticketmaster.com",
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
  "dice.fm",
];

export function isNonVenueEvidenceHost(hostOrUrl: string | null | undefined): boolean {
  if (!hostOrUrl?.trim()) return false;
  let host = hostOrUrl.trim().toLowerCase().replace(/^www\./, "");
  try {
    if (host.includes("/") || host.includes(":")) {
      host = new URL(host.includes("://") ? host : `https://${host}`).hostname
        .replace(/^www\./i, "")
        .toLowerCase();
    }
  } catch {
    return false;
  }
  return NON_VENUE_EVIDENCE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

export type EvidenceTrustInput = {
  pageText: string;
  excerpt: string | null;
  onOfficialVenueDomain: boolean;
  sourceKind: "official_website" | "official_social" | "third_party" | "snippet";
  placeIdentityStrong: boolean;
  geoConflict: boolean;
  nameOk: boolean;
};

export type EvidenceTrustResult = {
  trusted: boolean;
  reviewOnly: boolean;
  reasonCode: ListingEvidenceReasonCode;
  currentnessScore: number;
  authorityScore: number;
};

/**
 * Official-domain pages are NOT automatically trusted.
 * Require explicit open-mic language + venue relationship + current/recurring signal
 * and reject cancelled / historical-only / ambiguous mentions.
 */
export function evaluateFetchedEvidenceTrust(input: EvidenceTrustInput): EvidenceTrustResult {
  if (input.geoConflict) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.PLACE_OR_REGION_CONFLICT,
      currentnessScore: 0,
      authorityScore: 0,
    };
  }
  if (!input.nameOk || !input.placeIdentityStrong) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.NO_TRUSTED_EVIDENCE,
      currentnessScore: 0,
      authorityScore: 0.2,
    };
  }
  if (input.sourceKind === "snippet") {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.RAW_SNIPPET_ONLY,
      currentnessScore: 0.1,
      authorityScore: 0.1,
    };
  }

  const hay = `${input.excerpt || ""} ${input.pageText.slice(0, 8000)}`;
  if (!detectExplicitPhrase(hay)) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.NO_EXPLICIT_PHRASE,
      currentnessScore: 0.2,
      authorityScore: input.onOfficialVenueDomain ? 0.4 : 0.2,
    };
  }

  if (CANCELLED_RE.test(hay)) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_CANCELLED_EVENT,
      currentnessScore: 0,
      authorityScore: 0.5,
    };
  }

  const recurring = RECURRING_RE.test(hay);
  const current = CURRENT_RE.test(hay);
  const historical = HISTORICAL_RE.test(hay) && !current && !recurring;

  if (historical) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_HISTORICAL_ONLY,
      currentnessScore: 0.15,
      authorityScore: input.onOfficialVenueDomain ? 0.5 : 0.3,
    };
  }

  if (input.sourceKind === "official_social") {
    if (input.onOfficialVenueDomain && (recurring || current)) {
      return {
        trusted: true,
        reviewOnly: false,
        reasonCode: LISTING_EVIDENCE_REASON.SOCIAL_CURRENT_EVENT,
        currentnessScore: recurring ? 0.85 : 0.7,
        authorityScore: 0.75,
      };
    }
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.SOCIAL_AMBIGUOUS,
      currentnessScore: 0.4,
      authorityScore: 0.45,
    };
  }

  if (input.sourceKind === "third_party") {
    if (recurring || current) {
      return {
        trusted: false,
        reviewOnly: true,
        reasonCode: LISTING_EVIDENCE_REASON.THIRD_PARTY_STRUCTURED_CURRENT,
        currentnessScore: 0.65,
        authorityScore: 0.55,
      };
    }
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_AMBIGUOUS_MENTION,
      currentnessScore: 0.3,
      authorityScore: 0.4,
    };
  }

  // official_website
  if (!input.onOfficialVenueDomain) {
    return {
      trusted: false,
      reviewOnly: true,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_AMBIGUOUS_MENTION,
      currentnessScore: 0.35,
      authorityScore: 0.35,
    };
  }

  if (recurring) {
    return {
      trusted: true,
      reviewOnly: false,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_RECURRING_EVENT,
      currentnessScore: 0.95,
      authorityScore: 0.95,
    };
  }
  if (current) {
    return {
      trusted: true,
      reviewOnly: false,
      reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_CURRENT_EVENT,
      currentnessScore: 0.8,
      authorityScore: 0.9,
    };
  }

  // Explicit phrase on official domain but no currentness/recurrence → review only
  return {
    trusted: false,
    reviewOnly: true,
    reasonCode: LISTING_EVIDENCE_REASON.OFFICIAL_AMBIGUOUS_MENTION,
    currentnessScore: 0.35,
    authorityScore: 0.7,
  };
}

/**
 * Distinct US metros used to catch title↔stored-city misassignment.
 * Suburb/member names roll up to the same metro (Chicagoland suburbs stay with Chicago).
 */
const US_METRO_GEO: Array<{
  metro: string;
  city: string;
  region: string;
  members: string[];
}> = [
  {
    metro: "chicago",
    city: "Chicago",
    region: "IL",
    members: [
      "chicago",
      "chicagoland",
      "evanston",
      "oak park",
      "naperville",
      "aurora",
      "joliet",
      "schaumburg",
      "skokie",
      "cicero",
      "waukegan",
      "arlington heights",
      "elgin",
      "des plaines",
      "berwyn",
      "oak lawn",
      "tinley park",
      "orland park",
      "downers grove",
      "bolingbrook",
      "palatine",
      "mount prospect",
      "lombard",
      "elmhurst",
      "buffalo grove",
      "hoffman estates",
      "wheaton",
    ],
  },
  {
    metro: "indianapolis",
    city: "Indianapolis",
    region: "IN",
    members: ["indianapolis", "carmel", "fishers", "noblesville", "greenwood", "lawrence", "avon", "plainfield"],
  },
  {
    metro: "milwaukee",
    city: "Milwaukee",
    region: "WI",
    members: ["milwaukee", "waukesha", "west allis", "wauwatosa", "brookfield"],
  },
  {
    metro: "detroit",
    city: "Detroit",
    region: "MI",
    members: ["detroit", "dearborn", "warren", "sterling heights", "ann arbor", "royal oak", "ferndale"],
  },
  {
    metro: "minneapolis",
    city: "Minneapolis",
    region: "MN",
    members: ["minneapolis", "st paul", "saint paul", "bloomington", "duluth"],
  },
  {
    metro: "st_louis",
    city: "St. Louis",
    region: "MO",
    members: ["st louis", "saint louis"],
  },
  {
    metro: "columbus_oh",
    city: "Columbus",
    region: "OH",
    members: ["columbus"],
  },
  {
    metro: "cincinnati",
    city: "Cincinnati",
    region: "OH",
    members: ["cincinnati"],
  },
  {
    metro: "louisville",
    city: "Louisville",
    region: "KY",
    members: ["louisville"],
  },
  {
    metro: "nashville",
    city: "Nashville",
    region: "TN",
    members: ["nashville", "murfreesboro", "franklin"],
  },
  {
    metro: "madison",
    city: "Madison",
    region: "WI",
    members: ["madison"],
  },
  {
    metro: "kansas_city",
    city: "Kansas City",
    region: "MO",
    members: ["kansas city"],
  },
  {
    metro: "grand_rapids",
    city: "Grand Rapids",
    region: "MI",
    members: ["grand rapids"],
  },
];

function normalizeGeoToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function metroForCityRegion(
  city: string | null | undefined,
  region: string | null | undefined,
): { metro: string; city: string; region: string } | null {
  const c = normalizeGeoToken(city || "");
  if (!c) return null;
  const r = (region || "").trim().toUpperCase();
  for (const m of US_METRO_GEO) {
    if (!m.members.some((mem) => c === mem || c.startsWith(`${mem} `) || c.endsWith(` ${mem}`))) {
      continue;
    }
    // Columbus is ambiguous across states — require OH when region is present.
    if (m.metro === "columbus_oh" && r && r !== "OH") continue;
    if (r && r.length === 2 && r !== m.region) {
      // Allow missing/wrong short labels only when the member is unique to this metro.
      if (m.metro === "kansas_city" && (r === "KS" || r === "MO")) {
        return { metro: m.metro, city: m.city, region: r };
      }
      continue;
    }
    return { metro: m.metro, city: m.city, region: m.region };
  }
  return null;
}

/**
 * Pull an explicit "in City" / "City, ST" cue from a listing/event title.
 * Used to avoid stamping the discovery-market city onto an out-of-market venue.
 */
export function inferExplicitCityFromListingTitle(
  name: string | null | undefined,
): { city: string; region: string; metro: string } | null {
  const n = (name || "").trim();
  if (!n) return null;

  const ordered = [...US_METRO_GEO].sort(
    (a, b) => Math.max(...b.members.map((m) => m.length)) - Math.max(...a.members.map((m) => m.length)),
  );

  for (const m of ordered) {
    for (const mem of [...m.members].sort((a, b) => b.length - a.length)) {
      const memRe = mem.replace(/\s+/g, "\\s+");
      const inCity = new RegExp(`\\bin\\s+${memRe}\\b`, "i");
      const cityState = new RegExp(`\\b${memRe}\\s*,\\s*${m.region}\\b`, "i");
      if (inCity.test(n) || cityState.test(n)) {
        return { city: m.city, region: m.region, metro: m.metro };
      }
    }
  }
  return null;
}

export function listingHasGeoConflict(input: {
  region: string | null | undefined;
  city: string | null | undefined;
  formattedAddress: string | null | undefined;
  name: string;
  discoveryMarketSlug?: string | null;
}): boolean {
  const blob = `${input.name} ${input.formattedAddress || ""} ${input.city || ""}`.toLowerCase();
  const region = (input.region || "").toUpperCase();
  const market = (input.discoveryMarketSlug || "").toLowerCase();
  const saysGA = /\broswell\b/.test(blob) && (/\bga\b/.test(blob) || /georgia/.test(blob));
  // Market slug still used for the Roswell GA vs Chicagoland IL false-positive case.
  const saysIL = region === "IL" || /chicago|illinois/.test(market);
  if (saysGA && saysIL) return true;
  // Generic: address names a different US state abbreviation than region field
  const stateInAddr = blob.match(/,\s*([a-z]{2})(?:\s+\d{5}|$)/i)?.[1]?.toUpperCase();
  if (region && stateInAddr && region.length === 2 && stateInAddr !== region) {
    // Ignore common false positives when address lacks real structure
    if (/[a-z]{4,}/.test(input.formattedAddress || "") && stateInAddr !== "US") return true;
  }

  // Title names a different metro than the stored city (e.g. "in Indianapolis" + Chicago).
  const titleMetro = inferExplicitCityFromListingTitle(input.name);
  const storedMetro = metroForCityRegion(input.city, input.region);
  if (titleMetro && storedMetro && titleMetro.metro !== storedMetro.metro) {
    return true;
  }
  return false;
}
