/**
 * Canonical name quality for automated outreach personalization.
 * Scraped SEO titles and construction-page labels must never go into send copy.
 */
import { classifyListingName, suggestCanonicalListingName } from "@/lib/publicListings/listingQuality";

export type OutreachNameQualityReason =
  | "ok"
  | "under_construction"
  | "seo_keyword_dump"
  | "malformed"
  | "sentence_title"
  | "festival_event"
  | "listing_name_rejected";

export type OutreachNameQuality = {
  ok: boolean;
  reason: OutreachNameQualityReason;
  canonicalName: string | null;
  festival: boolean;
};

const UNDER_CONSTRUCTION_RE = /\bunder\s+constr|\bconstrutcion\b|\bcoming\s+soon\b|\bpage\s+under\s+construction\b/i;

const FESTIVAL_RE =
  /\b((jazz|music|film|arts?|folk|blues|comedy)\s+)?(festivals?|fest\b|conference|conferences|expo|world'?s\s+fair|state\s+fair)\b/i;

const VENUE_NOUN_RE =
  /\b(bar|pub|tavern|brewery|brewpub|taproom|cafe|café|club|comedy\s*club|theater|theatre|hall|room|venue|winery|lounge|restaurant|grill)\b/i;

function looksLikeSeoKeywordDump(name: string): boolean {
  const commas = (name.match(/,/g) || []).length;
  const words = name.trim().split(/\s+/).length;
  if (commas >= 3 && words >= 8) return true;
  if (commas >= 2 && words >= 12) return true;
  if (words >= 16) return true;
  if (/\b(bottomless|bottle\s+service|happy\s+hour|themed\s+bar|brunch\s+party)\b/i.test(name) && commas >= 1) {
    return true;
  }
  return false;
}

function looksLikeSentenceTitle(name: string): boolean {
  if (/[.!?]\s+[A-Z]/.test(name)) return true;
  if (/\b(these|this|those)\s+\d+\b/i.test(name)) return true;
  const words = name.trim().split(/\s+/).length;
  return words >= 14 && /[,:]/.test(name);
}

export function classifyOutreachNameQuality(input: {
  name: string;
  listingName?: string | null;
}): OutreachNameQuality {
  const name = (input.name || "").trim();
  const listingName = (input.listingName || "").trim();

  const festival =
    FESTIVAL_RE.test(name) && !VENUE_NOUN_RE.test(name) && !(listingName && VENUE_NOUN_RE.test(listingName));

  if (festival) {
    return { ok: false, reason: "festival_event", canonicalName: listingName || null, festival: true };
  }

  if (UNDER_CONSTRUCTION_RE.test(name)) {
    return { ok: false, reason: "under_construction", canonicalName: listingName || null, festival: false };
  }

  if (/^open[\s-]?mic(?:s)?(?:\s+night)?\s+at\b/i.test(name)) {
    const listingOk = listingName && classifyListingName(listingName) == null ? listingName : null;
    return { ok: false, reason: "sentence_title", canonicalName: listingOk, festival: false };
  }

  if (looksLikeSeoKeywordDump(name) || looksLikeSentenceTitle(name)) {
    const cleaned = suggestCanonicalListingName(name);
    const fallback = listingName && classifyListingName(listingName) == null ? listingName : cleaned;
    return {
      ok: false,
      reason: looksLikeSentenceTitle(name) && !looksLikeSeoKeywordDump(name) ? "sentence_title" : "seo_keyword_dump",
      canonicalName: fallback,
      festival: false,
    };
  }

  const rejected = classifyListingName(name);
  if (rejected) {
    const listingOk = listingName && classifyListingName(listingName) == null;
    return {
      ok: false,
      reason: "listing_name_rejected",
      canonicalName: listingOk ? listingName : suggestCanonicalListingName(name),
      festival: false,
    };
  }

  return { ok: true, reason: "ok", canonicalName: name, festival: false };
}
