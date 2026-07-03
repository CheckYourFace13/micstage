/**
 * Explicit open-mic evidence detection for public listings.
 *
 * A Google Places match proves a venue/place EXISTS; it does not prove the
 * venue actually hosts an open mic. To become publicly VERIFIED a listing must
 * ALSO have explicit open-mic evidence that is real and tied to the venue/event.
 *
 * WHAT COUNTS as evidence (real, venue-tied source text):
 *   - listing name
 *   - imported schedule title / description
 *   - source page title (venue site / event page / trusted third-party)
 *   - source page body snippet
 *   - extracted event title / description (discoveryHints)
 *
 * WHAT NEVER COUNTS:
 *   - generated `about` boilerplate (buildListingAboutFromLead)
 *   - generic discovery notes ("Open-mic-targeted nationwide discovery", "Tier ...",
 *     "Query: ...", "Market ...", email meta)
 *   - unrelated listicle / article / generic page titles
 *   - broad venue category ("live music venue") without an explicit open-mic phrase
 *   - search-result text that is not tied to the actual venue
 *   - page navigation / footer text
 *
 * "Trusted" evidence (safe for AUTO-publish to VERIFIED) is evidence that lives on
 * the listing itself (name/schedule) or comes from a venue/event/admin source, or
 * from a page on the venue's own domain. Evidence found only in an untrusted
 * search-result snippet is surfaced for admin review instead of auto-publishing.
 *
 * Keep EXPLICIT_OPEN_MIC_PATTERN + the noise filters in sync with the duplicated
 * copies in scripts/verify-public-listings-google.mjs and
 * scripts/audit-verified-open-mic-evidence.mjs (scripts cannot import TS).
 */
import { classifyListingName, isPublicListingNameOk } from "@/lib/publicListings/listingQuality";

/** Machine-readable reasons recorded in internalNotes / used by callers. */
export const OPEN_MIC_EVIDENCE_REASON = {
  /** Explicit evidence from a trusted, venue-tied source — safe to publish. */
  CONFIRMED: "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED",
  /** Explicit phrase found, but only in an untrusted source — hold for review. */
  UNTRUSTED: "OPEN_MIC_EVIDENCE_UNTRUSTED_SOURCE",
  /** No explicit open-mic phrase anywhere trustworthy. */
  MISSING: "NO_EXPLICIT_OPEN_MIC_EVIDENCE",
  /** Google place confirmed but no (trusted) open-mic evidence — hold for review. */
  PLACE_ONLY: "GOOGLE_PLACE_CONFIRMED_OPEN_MIC_EVIDENCE_MISSING",
  AWAITING_REVIEW: "GOOGLE_PLACE_CONFIRMED_AWAITING_REVIEW",
} as const;

/**
 * Explicit open-mic phrases. Deliberately narrow: only phrases that state a
 * venue runs an open mic / open jam / open stage. Broad "live music" wording is
 * intentionally excluded (that's what created the false positives).
 */
const EXPLICIT_OPEN_MIC_PATTERN =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen[\s-]?mic\s*(?:night|signup|sign[\s-]?up)\b)|(\bopen\s+jam\b)|(\bopen\s+blues\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bsongwriter\s+(?:open\s*mic|night)\b)|(\bspoken\s+word\s+open\s*mic\b)/i;

/**
 * Generated / generic text that contains an open-mic phrase but is NOT evidence.
 * These are stripped before matching so boilerplate can never create a match.
 */
const NON_EVIDENCE_NOISE: RegExp[] = [
  /open[\s-]?mic venue identified from public listings and web search\.?/gi,
  /live music venue with open mic or performer signup signals\.?/gi,
  /open[\s\u2013-]?mic[\s\u2013-]*targeted nationwide discovery\.?/gi,
  /\bquery:\s*[^.]*\.?/gi,
  /\btier\s+[a-z0-9_]+\b/gi,
  /\bmarket\s+[a-z0-9-]+\b/gi,
  /discovered via [^.]*\.?/gi,
  /\[micstage_email_meta\][^.]*\.?/gi,
];

function stripNonEvidenceNoise(text: string): string {
  let t = ` ${text} `;
  for (const re of NON_EVIDENCE_NOISE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Returns the first explicit open-mic phrase found in `text`, or null (raw). */
export function explicitOpenMicMatch(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}

/** Match after stripping generated/generic boilerplate that carries open-mic wording. */
function explicitOpenMicMatchClean(text: string | null | undefined): string | null {
  if (!text) return null;
  return explicitOpenMicMatch(stripNonEvidenceNoise(text));
}

/** Title-like fields that are articles/listicles/generic pages are not venue evidence. */
function isNonVenueTitle(text: string): boolean {
  const rejection = classifyListingName(text);
  return (
    rejection === "ARTICLE_OR_LISTICLE" ||
    rejection === "GENERIC_PAGE_TITLE" ||
    rejection === "NON_VENUE_TITLE"
  );
}

/**
 * Growth-lead source kinds we treat as venue/event/admin sources (trusted for
 * auto-publish). SCHEDULED_JOB / UNKNOWN are only trusted when the source URL is
 * on the venue's own domain.
 */
const TRUSTED_SOURCE_KINDS = new Set([
  "WEBSITE_CONTACT",
  "SOCIAL_PROFILE",
  "EVENT_LISTING",
  "CSV_IMPORT",
  "CLAUDE_CSV",
  "MANUAL_ADMIN",
]);

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function sourceOnVenueDomain(sourceUrl?: string | null, websiteUrl?: string | null): boolean {
  const a = hostOf(sourceUrl);
  const b = hostOf(websiteUrl);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Keys in discoveryHints that may carry real, extracted evidence text. */
const HINT_EVIDENCE_KEYS = [
  "eventTitle",
  "eventDescription",
  "evidenceSnippet",
  "openMicEvidence",
  "pageTitle",
  "sourceTitle",
];

function collectHintEvidenceStrings(hints: unknown): string[] {
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return [];
  const h = hints as Record<string, unknown>;
  const out: string[] = [];
  for (const key of HINT_EVIDENCE_KEYS) {
    const v = h[key];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}

export type OpenMicEvidenceField = "name" | "schedule" | "sourceTitle" | "sourceSnippet" | "discoveryHints";

export type OpenMicEvidenceInput = {
  listingName?: string | null;
  schedules?: Array<{ title: string | null; description: string | null }> | null;
  sourceTitle?: string | null;
  sourceSnippet?: string | null;
  sourceUrl?: string | null;
  /** Venue's own website — used to confirm a source snippet is on-domain. */
  websiteUrl?: string | null;
  discoveryHints?: unknown;
  sourceKind?: string | null;
};

export type OpenMicEvidenceResult = {
  /** An explicit open-mic phrase was found somewhere that isn't boilerplate. */
  hasEvidence: boolean;
  /** Evidence is explicit AND from a trusted, venue-tied source (safe to publish). */
  trusted: boolean;
  /** Which field the evidence came from. */
  field: OpenMicEvidenceField | null;
  /** Short matched context (for admin review / notes). */
  snippet: string | null;
  /** The exact phrase that matched. */
  matchedPhrase: string | null;
  /** Machine reason (see OPEN_MIC_EVIDENCE_REASON). */
  reason: string;
};

const NO_EVIDENCE: OpenMicEvidenceResult = {
  hasEvidence: false,
  trusted: false,
  field: null,
  snippet: null,
  matchedPhrase: null,
  reason: OPEN_MIC_EVIDENCE_REASON.MISSING,
};

function shorten(text: string, phrase: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  const i = clean.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return `${clean.slice(0, 157)}…`;
  const start = Math.max(0, i - 60);
  const end = Math.min(clean.length, i + phrase.length + 80);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

/**
 * Evaluate all available evidence for a listing/lead and decide whether there is
 * explicit open-mic evidence and whether it is trustworthy enough to auto-publish.
 *
 * Trust rules (auto-publish requires `trusted === true`):
 *   - name / schedule: durable, tied to the listing → trusted.
 *   - structured source (sourceTitle / extracted discoveryHints event fields):
 *     trusted only when the listing has a valid venue name AND the source is a
 *     venue/event/admin source or lives on the venue's own domain.
 *   - raw source snippet (SERP body text): review-only signal, never trusted —
 *     it is "search result text" that may not be tied to the venue's open mic.
 *
 * A non-trusted match is still returned as a review signal (hasEvidence=true,
 * trusted=false) so the admin queue can prioritise real candidates.
 */
export function evaluateOpenMicEvidence(input: OpenMicEvidenceInput): OpenMicEvidenceResult {
  const kindTrusted = !!input.sourceKind && TRUSTED_SOURCE_KINDS.has(input.sourceKind);
  const onDomain = sourceOnVenueDomain(input.sourceUrl, input.websiteUrl);
  const validName = !!input.listingName && isPublicListingNameOk(input.listingName);
  // Structured extracted evidence can be trusted; raw SERP snippets cannot.
  const structuredTrust = validName && (kindTrusted || onDomain);

  // 1) Listing name — durable and tied to the listing, but only when the name is
  //    a real venue/event name. Aggregator/directory names ("Open Mic Portland")
  //    contain the phrase yet are not evidence of a specific venue's open mic.
  const nameMatch = validName ? explicitOpenMicMatch(input.listingName) : null;
  if (nameMatch && input.listingName) {
    return {
      hasEvidence: true,
      trusted: true,
      field: "name",
      snippet: shorten(input.listingName, nameMatch),
      matchedPhrase: nameMatch,
      reason: OPEN_MIC_EVIDENCE_REASON.CONFIRMED,
    };
  }

  // 2) Imported schedule title/description — structured, tied to the listing.
  for (const s of input.schedules ?? []) {
    const text = [s.title, s.description].filter(Boolean).join(" — ");
    const m = explicitOpenMicMatchClean(text);
    if (m) {
      return {
        hasEvidence: true,
        trusted: true,
        field: "schedule",
        snippet: shorten(text, m),
        matchedPhrase: m,
        reason: OPEN_MIC_EVIDENCE_REASON.CONFIRMED,
      };
    }
  }

  // 3) Real source text. Structured title/hint fields may be trusted; the raw
  //    SERP snippet is a review-only signal.
  let untrusted: OpenMicEvidenceResult | null = null;
  const candidates: Array<{ field: OpenMicEvidenceField; text: string; titleLike: boolean; canTrust: boolean }> = [];
  if (input.sourceTitle)
    candidates.push({ field: "sourceTitle", text: input.sourceTitle, titleLike: true, canTrust: structuredTrust });
  for (const t of collectHintEvidenceStrings(input.discoveryHints)) {
    candidates.push({ field: "discoveryHints", text: t, titleLike: true, canTrust: structuredTrust });
  }
  if (input.sourceSnippet)
    candidates.push({ field: "sourceSnippet", text: input.sourceSnippet, titleLike: false, canTrust: false });

  for (const c of candidates) {
    // Reject listicle/article/generic titles outright — never venue evidence.
    if (c.titleLike && isNonVenueTitle(c.text)) continue;
    const m = explicitOpenMicMatchClean(c.text);
    if (!m) continue;
    const result: OpenMicEvidenceResult = {
      hasEvidence: true,
      trusted: c.canTrust,
      field: c.field,
      snippet: shorten(stripNonEvidenceNoise(c.text), m),
      matchedPhrase: m,
      reason: c.canTrust ? OPEN_MIC_EVIDENCE_REASON.CONFIRMED : OPEN_MIC_EVIDENCE_REASON.UNTRUSTED,
    };
    if (result.trusted) return result;
    if (!untrusted) untrusted = result;
  }

  return untrusted ?? NO_EVIDENCE;
}

export type OpenMicEvidence = {
  hasEvidence: boolean;
  /** Where the evidence was found ("name" | "schedule"), or null. */
  source: "name" | "schedule" | null;
  /** The matched phrase (short), or null. */
  snippet: string | null;
};

/**
 * Back-compatible detector limited to listing name + schedules (both trusted).
 * New code should prefer {@link evaluateOpenMicEvidence}.
 */
export function detectOpenMicEvidence(listing: {
  name: string;
  schedules?: Array<{ title: string | null; description: string | null }> | null;
}): OpenMicEvidence {
  const r = evaluateOpenMicEvidence({ listingName: listing.name, schedules: listing.schedules });
  if (r.hasEvidence && (r.field === "name" || r.field === "schedule")) {
    return { hasEvidence: true, source: r.field, snippet: r.snippet };
  }
  return { hasEvidence: false, source: null, snippet: null };
}

/**
 * Pull the raw discovery snippet from a growth lead's internalNotes. The web
 * search adapter records "... Snippet: <serp snippet>.<optional fetch note>".
 */
export function extractDiscoverySnippet(internalNotes: string | null | undefined): string | null {
  if (!internalNotes) return null;
  const idx = internalNotes.indexOf("Snippet:");
  if (idx === -1) return null;
  let s = internalNotes.slice(idx + "Snippet:".length).trim();
  s = s.replace(/Page fetch failed[^.]*\.?/i, "").replace(/scored from SERP only\.?/i, "").trim();
  s = s.replace(/^["'\s]+|["'\s.]+$/g, "").trim();
  return s.length >= 3 ? s : null;
}
