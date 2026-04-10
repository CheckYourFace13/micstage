import type {
  GrowthLeadAcquisitionStage,
  GrowthLeadContactQuality,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  GrowthLeadSourceKind,
  GrowthLeadType,
} from "@/generated/prisma/client";

/** Normalized shape produced by source adapters and fed into ingestion. */
export type GrowthLeadCandidate = {
  leadType: GrowthLeadType;
  name: string;
  contactEmailNormalized?: string | null;
  /** Additional discovered emails for durable reuse (first-class contacts), venue-first. */
  additionalContactEmails?: string[];
  /** When true, parsed as scraped/noisy context (MEDIUM vs HIGH confidence). */
  emailExtractedFromNoisyText?: boolean;
  /** MANUAL_ADMIN only: allow example.com-style placeholders through validation. */
  allowPlaceholderEmail?: boolean;
  contactUrl?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
  facebookUrl?: string | null;
  openMicSignalTier?: GrowthLeadOpenMicSignalTier | null;
  contactQuality?: GrowthLeadContactQuality | null;
  acquisitionStage?: GrowthLeadAcquisitionStage | null;
  city?: string | null;
  suburb?: string | null;
  region?: string | null;
  discoveryMarketSlug: string;
  source?: string | null;
  sourceKind: GrowthLeadSourceKind;
  fitScore?: number | null;
  discoveryConfidence?: number | null;
  performanceTags?: GrowthLeadPerformanceTag[];
  importKey?: string | null;
  internalNotes?: string | null;
};
