/**
 * Semantic open-mic event detection for outreach (and discovery scoring).
 *
 * Token proximity of "open" + "mic" is not evidence. Require an event that
 * performers can join, tied to the target venue — not artist bios, equipment
 * copy, person names ("Open Mike Eagle"), or generic "open to the public".
 */

export type FalseOpenMicClass =
  | "open_mike_person"
  | "microphone_equipment"
  | "artist_bio"
  | "generic_open_copy";

const EQUIPMENT_RE =
  /\b(wireless\s+mics?|microphone\s+rentals?|mic\s+rentals?|mics?\s+available|speaker\s+and\s+mics?|sound\s+system.{0,24}mics?|mic\s+package|handheld\s+mics?|lav(?:alier)?\s+mics?|mic\s+check\b|buy\s+a\s+mic|pa\s+system.{0,20}mic)\b/i;

const ARTIST_BIO_RE =
  /\b((got|gets?|getting)\s+(his|her|their|my)\s+start\s+at\s+open\s+mi(?:c|ke)s?|(started|began)(?:\s+(his|her|their|my)\s+(career|journey))?\s+at\s+open\s+mi(?:c|ke)s?|played\s+open\s+mi(?:c|ke)\s+nights?|playing\s+open\s+mi(?:c|ke)s?|from\s+open\s+mi(?:c|ke)s?\s+to|years?\s+of\s+open\s+mi(?:c|ke)s?|tour(?:ed|ing)\s+(the\s+)?open\s+mi(?:c|ke)s?|cut\s+(his|her|their)\s+teeth\s+at\s+open\s+mi(?:c|ke)s?)\b/i;

const SEARCH_RESULT_NOISE_RE =
  /\bfind\s+open[\s-]?mi(?:c|ke)s?\b|\bopen[\s-]?mi(?:c|ke)s?\s+(?:near\s+you|near\s+me|in\s+your\s+area|around)\b|\bopen[\s-]?mic\s+nights?\s+near\b/i;

const GENERIC_OPEN_RE =
  /\b(open\s+to\s+the\s+public|open\s+house|open\s+bar|open\s+event|now\s+open|grand\s+opening)\b/i;

const OPEN_MIKE_PERSON_RE =
  /\bopen\s+mike\s+(eagle|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/;

/** "open mike" as a person/name token — not "open mike night". */
const OPEN_MIKE_BARE_RE = /\bopen\s+mike\b/i;
const OPEN_MIKE_EVENT_FOLLOW_RE =
  /\bopen\s+mike\s+(night|nights|comedy|poetry|signup|sign[\s-]?up|thursday|tuesday|wednesday|monday|friday|sunday|saturday|weekly|every)\b/i;

/**
 * Event-like phrases that mean the venue hosts performer-signup open mic / jam.
 * Bare "open mic" / "open mics" without event context is NOT enough.
 */
const EVENT_PHRASE_RE =
  /\b(?:weekly|monthly|bi-?weekly|recurring)\s+(?:comedy\s+|poetry\s+|music\s+|acoustic\s+)?open[\s-]?mics?\b|\b(?:comedy|poetry|music|acoustic)\s+open[\s-]?mics?(?:\s+night)?\b|\bopen[\s-]?mic\s+(?:night|nights|signup|sign[\s-]?up|tuesdays?|wednesdays?|thursdays?|mondays?|fridays?|sundays?|saturdays?|every|weekly)\b|\bhosts?\s+(?:an?\s+|our\s+|a\s+weekly\s+)?open[\s-]?mics?\b|\b(?:our|the)\s+open[\s-]?mic\s+nights?\b|\bsign[\s-]?ups?\s+(?:for|start|open).{0,40}open[\s-]?mics?\b|\bperformers?\s+(?:can\s+|may\s+)?sign[\s-]?up.{0,80}open[\s-]?(?:mic|jam)\b|\bopen[\s-]?jam(?:\s+(?:night|session))?\b|\bjam\s+night\b|\bsongwriter\s+(?:open[\s-]?mic|night)\b|\bopen\s+blues\s+jam\b|\bspoken\s+word\s+open[\s-]?mics?\b|\bopen[\s-]?mic\s+every\b|\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday).{0,40}open[\s-]?mics?\b/i;

const OPEN_STAGE_WITH_PARTICIPATION_RE =
  /\bopen\s+stage\b.{0,80}\b(sign[\s-]?up|performers?|amateurs?|bring\s+your\s+(?:songs?|poems?|material))\b|\b(sign[\s-]?up|performers?).{0,80}\bopen\s+stage\b/i;

const GEO_OR_GENERIC_NAME_TOKENS = new Set([
  "the",
  "and",
  "for",
  "of",
  "at",
  "in",
  "on",
  "bar",
  "pub",
  "club",
  "cafe",
  "restaurant",
  "grill",
  "lounge",
  "venue",
  "room",
  "hall",
  "open",
  "mic",
  "night",
  "music",
  "live",
  "comedy",
  "city",
  "downtown",
]);

export function windowAround(text: string, index: number, radius = 90): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end);
}

export function classifyFalseOpenMicSemantics(text: string | null | undefined): FalseOpenMicClass | null {
  if (!text?.trim()) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (OPEN_MIKE_PERSON_RE.test(t)) return "open_mike_person";
  if (OPEN_MIKE_BARE_RE.test(t) && !OPEN_MIKE_EVENT_FOLLOW_RE.test(t)) return "open_mike_person";
  if (ARTIST_BIO_RE.test(t)) return "artist_bio";
  if (EQUIPMENT_RE.test(t) && !EVENT_PHRASE_RE.test(t)) return "microphone_equipment";
  if (GENERIC_OPEN_RE.test(t) && !EVENT_PHRASE_RE.test(t)) return "generic_open_copy";
  if (SEARCH_RESULT_NOISE_RE.test(t) && !/\bhosts?\b|\bevery\s+(monday|tuesday|wednesday|thursday)/i.test(t)) {
    return "generic_open_copy";
  }
  return null;
}

export type OpenMicEventMatch = {
  phrase: string;
  index: number;
  window: string;
};

export function isOpenMicEventTitle(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 90) return false;
  if (classifyFalseOpenMicSemantics(t)) return false;
  if (/\b(near|across|guide|directory|best|top)\b/i.test(t)) return false;
  return /^(?:.+?\s+)?open[\s-]?mics?(?:\s+night)?(?:\s+[-–|@].+)?$/i.test(t);
}

export function findOpenMicEventMatches(text: string | null | undefined): OpenMicEventMatch[] {
  if (!text?.trim()) return [];
  const t = text.replace(/\s+/g, " ");
  const out: OpenMicEventMatch[] = [];
  const patterns = [EVENT_PHRASE_RE, OPEN_STAGE_WITH_PARTICIPATION_RE];
  for (const re of patterns) {
    re.lastIndex = 0;
    const clone = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = clone.exec(t))) {
      const window = windowAround(t, m.index);
      if (classifyFalseOpenMicSemantics(window)) continue;
      out.push({ phrase: m[0].trim(), index: m.index, window });
      if (out.length >= 8) return out;
    }
  }
  if (!out.length && isOpenMicEventTitle(t)) {
    const idx = t.toLowerCase().search(/open[\s-]?mic/);
    out.push({ phrase: "open mic", index: idx < 0 ? 0 : idx, window: t });
  }
  return out;
}

export function hasOpenMicEventSemantics(text: string | null | undefined): boolean {
  if (classifyFalseOpenMicSemantics(text) && findOpenMicEventMatches(text).length === 0) return false;
  return findOpenMicEventMatches(text).length > 0;
}

export function distinctiveVenueTokens(name: string | null | undefined): string[] {
  if (!name?.trim()) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !GEO_OR_GENERIC_NAME_TOKENS.has(t));
}

/**
 * True when an open-mic EVENT phrase is bound to this venue: distinctive name
 * tokens appear near the phrase, or the text is first-party (caller decides).
 */
export function isTargetBoundOpenMicText(
  text: string | null | undefined,
  venueName: string | null | undefined,
  extraTokens: Array<string | null | undefined> = [],
): boolean {
  const matches = findOpenMicEventMatches(text);
  if (!matches.length || !text) return false;
  const tokens = [
    ...distinctiveVenueTokens(venueName),
    ...extraTokens.flatMap((t) => distinctiveVenueTokens(t)),
  ];
  if (!tokens.length) return false;
  const lower = text.toLowerCase();
  return matches.some((m) => {
    const win = m.window.toLowerCase();
    return tokens.some((tok) => win.includes(tok) || lower.includes(tok));
  });
}

export function isOfficialVenueEventsUrl(url: string | null | undefined, venueHost: string | null | undefined): boolean {
  if (!url?.trim() || !venueHost?.trim()) return false;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const vh = venueHost.replace(/^www\./i, "").toLowerCase();
    if (!(host === vh || host.endsWith(`.${vh}`) || vh.endsWith(`.${host}`))) return false;
    const path = u.pathname.toLowerCase();
    return /\/(events?|calendar|music|comedy|open-?mic|jam|live|shows?|happenings?)(\b|\/|$)/i.test(path);
  } catch {
    return false;
  }
}

/** Discovery scoring must never treat the search query as open-mic evidence. */
export function stripDiscoveryQueryNoise(text: string): string {
  return text
    .replace(/\bquery:\s*[^.]*\.?/gi, " ")
    .replace(/\bopen[\s\u2013-]?mic[\s\u2013-]*targeted nationwide discovery\.?/gi, " ")
    .replace(/\btier\s+[a-z0-9_]+\b/gi, " ")
    .replace(/\bmarket\s+[a-z0-9-]+\b/gi, " ")
    .replace(/\[micstage_email_meta\][^.]*\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
