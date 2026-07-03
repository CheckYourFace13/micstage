/**
 * Explicit open-mic evidence detection for public listings.
 *
 * A Google Places match proves a venue/place EXISTS; it does not prove the
 * venue actually hosts an open mic. To become publicly VERIFIED a listing must
 * ALSO have explicit open-mic evidence that is tied to the venue/event itself.
 *
 * IMPORTANT: the auto-generated `about` blurb (buildListingAboutFromLead) and the
 * raw discovery snippet are NOT reliable evidence — they contain boilerplate like
 * "Live music venue with open mic or performer signup signals." for every
 * STRONG_LIVE_EVENT lead. Reliable, venue-tied evidence lives in durable,
 * structured fields: the listing NAME and real SCHEDULE titles/descriptions.
 *
 * Keep EXPLICIT_OPEN_MIC_PATTERN in sync with the duplicated copies in
 * scripts/verify-public-listings-google.mjs and
 * scripts/audit-verified-open-mic-evidence.mjs (scripts cannot import TS).
 */

/** Machine-readable reasons recorded in internalNotes for the evidence gate. */
export const OPEN_MIC_EVIDENCE_REASON = {
  CONFIRMED: "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED",
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

/** Returns the first explicit open-mic phrase found in `text`, or null. */
export function explicitOpenMicMatch(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}

export type OpenMicEvidence = {
  hasEvidence: boolean;
  /** Where the evidence was found ("name" | "schedule"), or null. */
  source: "name" | "schedule" | null;
  /** The matched phrase (short), or null. */
  snippet: string | null;
};

/**
 * Detect explicit open-mic evidence tied to a listing. Checks the listing name
 * and any structured schedule titles/descriptions. Does NOT consider `about`
 * (boilerplate) or the raw discovery snippet (unreliable / listicle-sourced).
 */
export function detectOpenMicEvidence(listing: {
  name: string;
  schedules?: Array<{ title: string | null; description: string | null }> | null;
}): OpenMicEvidence {
  const nameMatch = explicitOpenMicMatch(listing.name);
  if (nameMatch) return { hasEvidence: true, source: "name", snippet: nameMatch };

  for (const s of listing.schedules ?? []) {
    const m = explicitOpenMicMatch(s.title) ?? explicitOpenMicMatch(s.description);
    if (m) return { hasEvidence: true, source: "schedule", snippet: m };
  }

  return { hasEvidence: false, source: null, snippet: null };
}
