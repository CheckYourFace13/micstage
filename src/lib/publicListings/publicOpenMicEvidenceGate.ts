/**
 * Public open-mic evidence eligibility — orthogonal to place identity and
 * display-quality name gates.
 *
 * PUBLIC discovery / claim invites require:
 *   place VERIFIED + display-quality OK + this eligibility in
 *   { PUBLIC_OPEN_MIC_CONFIRMED, PUBLIC_OPEN_MIC_AGED }
 *
 * Age policy (recurring open mics often keep stale websites):
 *   - ≤ ~18 months since last evidence/verify → CONFIRMED (fresh)
 *   - ≤ ~36 months with recurring/name/schedule signal → AGED (still public,
 *     queued for refresh)
 *   - older without recurrence → NEEDS_EVIDENCE (hold)
 */
import {
  evaluateOpenMicEvidence,
  OPEN_MIC_EVIDENCE_REASON,
  type OpenMicEvidenceInput,
  type OpenMicEvidenceResult,
} from "@/lib/publicListings/openMicEvidence";
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";

export const PUBLIC_OPEN_MIC_ELIGIBILITY = {
  PUBLIC_OPEN_MIC_CONFIRMED: "PUBLIC_OPEN_MIC_CONFIRMED",
  PUBLIC_OPEN_MIC_AGED: "PUBLIC_OPEN_MIC_AGED",
  NEEDS_EVIDENCE: "NEEDS_EVIDENCE",
  NOT_AN_OPEN_MIC: "NOT_AN_OPEN_MIC",
  CONFLICTED: "CONFLICTED",
} as const;

export type PublicOpenMicEligibility =
  (typeof PUBLIC_OPEN_MIC_ELIGIBILITY)[keyof typeof PUBLIC_OPEN_MIC_ELIGIBILITY];

export type PublicOpenMicEvidenceBucket =
  | "STRONG_CURRENT"
  | "STRONG_RECURRING_BUT_AGED"
  | "THIRD_PARTY_CURRENT"
  | "WEAK"
  | "NONE"
  | "CONFLICTED";

/** ~18 months — websites for weekly mics often go unchanged. */
export const EVIDENCE_FRESH_DAYS = 540;
/** ~36 months — still public if recurrence/name/schedule is strong. */
export const EVIDENCE_AGED_MAX_DAYS = 1095;

const CANCELLED_RE =
  /\b(cancelled|canceled|permanently\s+closed|no\s+longer\s+(?:running|happening|taking\s+place)|final\s+night|postponed\s+indefinitely)\b/i;

const RECURRING_RE =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|each\s+week|first\s+(monday|tuesday|wednesday|thursday|friday)|every\s+other)\b/i;

const HISTORICAL_RE =
  /\b(archive|archived|looking\s+back|in\s+20(0\d|1\d|2[0-3])\b|formerly|used\s+to\s+(?:host|run)|past\s+events?|one[\s-]?time)\b/i;

const WEAK_LIVE_RE = /\b(live\s+music|music\s+venue|concerts?|entertainment)\b/i;

export type StoredEvidenceRow = {
  trusted: boolean;
  reviewOnly?: boolean;
  detectedPhrase?: string | null;
  evidenceExcerpt?: string | null;
  evidenceTitle?: string | null;
  reasonCode?: string | null;
  fetchedAt?: Date | null;
  evidenceDate?: Date | null;
  currentnessScore?: number | null;
  sourceType?: string | null;
};

export type PublicOpenMicEvidenceGateInput = Omit<OpenMicEvidenceInput, "schedules"> & {
  about?: string | null;
  internalNotes?: string | null;
  region?: string | null;
  city?: string | null;
  formattedAddress?: string | null;
  discoveryMarketSlug?: string | null;
  lastVerifiedAt?: Date | null;
  googlePlaceVerifiedAt?: Date | null;
  googlePlaceId?: string | null;
  schedules?: Array<{
    title: string | null;
    description: string | null;
    weekday?: string | null;
    isActive?: boolean | null;
  }> | null;
  storedEvidence?: StoredEvidenceRow[] | null;
};

export type PublicOpenMicEvidenceGateResult = {
  bucket: PublicOpenMicEvidenceBucket;
  eligibility: PublicOpenMicEligibility;
  reason: string;
  /** Safe for public discovery + claim invites. */
  publicReady: boolean;
  /** Queue for evidence refresh without hiding. */
  needsRefresh: boolean;
  ageDays: number | null;
  baseEvidence: OpenMicEvidenceResult;
};

function daysSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  return (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000);
}

function haystack(input: PublicOpenMicEvidenceGateInput): string {
  const parts: string[] = [
    input.listingName ?? "",
    input.about ?? "",
    input.internalNotes ?? "",
    ...(input.schedules ?? []).flatMap((s) => [s.title ?? "", s.description ?? ""]),
    ...(input.storedEvidence ?? []).flatMap((e) => [
      e.detectedPhrase ?? "",
      e.evidenceExcerpt ?? "",
      e.evidenceTitle ?? "",
      e.reasonCode ?? "",
    ]),
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Classify whether a listing may stay publicly discoverable as an open mic.
 */
export function classifyPublicOpenMicEvidence(
  input: PublicOpenMicEvidenceGateInput,
): PublicOpenMicEvidenceGateResult {
  const base = evaluateOpenMicEvidence(input);
  const hay = haystack(input);
  const nameOk = !!input.listingName && isPublicListingNameOk(input.listingName);

  if (
    listingHasGeoConflict({
      region: input.region,
      city: input.city,
      formattedAddress: input.formattedAddress,
      name: input.listingName ?? "",
      discoveryMarketSlug: input.discoveryMarketSlug,
    })
  ) {
    return {
      bucket: "CONFLICTED",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.CONFLICTED,
      reason: "geo_conflict",
      publicReady: false,
      needsRefresh: false,
      ageDays: null,
      baseEvidence: base,
    };
  }

  if (CANCELLED_RE.test(hay) || /PLACE_OR_REGION_CONFLICT|OFFICIAL_CANCELLED/i.test(hay)) {
    return {
      bucket: "CONFLICTED",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.CONFLICTED,
      reason: "cancellation_or_conflict",
      publicReady: false,
      needsRefresh: false,
      ageDays: null,
      baseEvidence: base,
    };
  }

  const trustedStored = (input.storedEvidence ?? []).filter((e) => e.trusted);
  const anyPhraseStored = (input.storedEvidence ?? []).some((e) => !!e.detectedPhrase);
  const scheduleActive = (input.schedules ?? []).some((s) => s.isActive !== false && s.weekday);
  const recurring = RECURRING_RE.test(hay) || scheduleActive;
  const historical = HISTORICAL_RE.test(hay) && !recurring && !base.trusted;

  const bestDate =
    [...(input.storedEvidence ?? [])]
      .map((e) => e.fetchedAt || e.evidenceDate)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ??
    input.lastVerifiedAt ??
    input.googlePlaceVerifiedAt ??
    null;
  const ageDays = daysSince(bestDate);

  if (historical && !base.hasEvidence) {
    return {
      bucket: "CONFLICTED",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.NOT_AN_OPEN_MIC,
      reason: "historical_only",
      publicReady: false,
      needsRefresh: false,
      ageDays,
      baseEvidence: base,
    };
  }

  // Trusted explicit evidence (name / schedule / on-domain structured) OR trusted stored row
  const strong = base.trusted || trustedStored.length > 0;

  if (!strong) {
    if (base.hasEvidence || anyPhraseStored) {
      return {
        bucket: "THIRD_PARTY_CURRENT",
        eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.NEEDS_EVIDENCE,
        reason: base.reason === OPEN_MIC_EVIDENCE_REASON.UNTRUSTED ? "untrusted_source" : "third_party_only",
        publicReady: false,
        needsRefresh: true,
        ageDays,
        baseEvidence: base,
      };
    }
    if (WEAK_LIVE_RE.test(hay) && nameOk) {
      return {
        bucket: "WEAK",
        eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.NEEDS_EVIDENCE,
        reason: "live_music_only",
        publicReady: false,
        needsRefresh: true,
        ageDays,
        baseEvidence: base,
      };
    }
    return {
      bucket: "NONE",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.NEEDS_EVIDENCE,
      reason: OPEN_MIC_EVIDENCE_REASON.PLACE_ONLY,
      publicReady: false,
      needsRefresh: true,
      ageDays,
      baseEvidence: base,
    };
  }

  // Strong evidence — apply age
  if (ageDays != null && ageDays > EVIDENCE_AGED_MAX_DAYS && !recurring) {
    return {
      bucket: "STRONG_RECURRING_BUT_AGED",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.NEEDS_EVIDENCE,
      reason: "evidence_stale_over_36mo",
      publicReady: false,
      needsRefresh: true,
      ageDays,
      baseEvidence: base,
    };
  }

  if (ageDays != null && ageDays > EVIDENCE_FRESH_DAYS) {
    return {
      bucket: "STRONG_RECURRING_BUT_AGED",
      eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.PUBLIC_OPEN_MIC_AGED,
      reason: "evidence_aging_18mo_plus",
      publicReady: true,
      needsRefresh: true,
      ageDays,
      baseEvidence: base,
    };
  }

  return {
    bucket: "STRONG_CURRENT",
    eligibility: PUBLIC_OPEN_MIC_ELIGIBILITY.PUBLIC_OPEN_MIC_CONFIRMED,
    reason: base.field ? `trusted_${base.field}` : "trusted_stored_evidence",
    publicReady: true,
    needsRefresh: false,
    ageDays,
    baseEvidence: base,
  };
}

/** Discovery / claim-invite gate: explicit open-mic evidence must be public-ready. */
export function listingHasPublicOpenMicEvidence(input: PublicOpenMicEvidenceGateInput): boolean {
  return classifyPublicOpenMicEvidence(input).publicReady;
}
