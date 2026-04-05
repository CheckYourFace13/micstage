import type { GrowthLeadPerformanceTag, GrowthLeadSourceKind, GrowthLeadType } from "@/generated/prisma/client";

/** Normalized shape produced by source adapters and fed into ingestion. */
export type GrowthLeadCandidate = {
  leadType: GrowthLeadType;
  name: string;
  contactEmailNormalized?: string | null;
  contactUrl?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
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
