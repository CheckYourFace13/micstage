import type { GrowthLeadPerformanceTag, GrowthLeadStatus, GrowthLeadType } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type GrowthLeadListFilters = {
  marketSlug?: string | null;
  leadType?: GrowthLeadType | null;
  cityContains?: string | null;
  suburbContains?: string | null;
  tagsAny?: GrowthLeadPerformanceTag[];
  statuses?: GrowthLeadStatus[] | null;
  fitMin?: number | null;
  fitMax?: number | null;
  nameContains?: string | null;
  /** When true, restricts to DISCOVERED | REVIEWED | APPROVED (ignores `statuses`). */
  pipelineOnly?: boolean;
  /** When true, only leads with at least one PENDING_REVIEW outreach draft. */
  draftPending?: boolean;
};

export function buildGrowthLeadWhere(f: GrowthLeadListFilters): Prisma.GrowthLeadWhereInput {
  const w: Prisma.GrowthLeadWhereInput = {};

  if (f.marketSlug?.trim()) {
    w.discoveryMarketSlug = { equals: f.marketSlug.trim(), mode: "insensitive" };
  }

  if (f.leadType) {
    w.leadType = f.leadType;
  }

  if (f.pipelineOnly) {
    w.status = { in: ["DISCOVERED", "REVIEWED", "APPROVED"] };
  } else if (f.statuses && f.statuses.length > 0) {
    w.status = { in: f.statuses };
  }

  if (f.cityContains?.trim()) {
    w.city = { contains: f.cityContains.trim(), mode: "insensitive" };
  }

  if (f.suburbContains?.trim()) {
    w.suburb = { contains: f.suburbContains.trim(), mode: "insensitive" };
  }

  if (f.tagsAny && f.tagsAny.length > 0) {
    w.performanceTags = { hasSome: f.tagsAny };
  }

  if (f.nameContains?.trim()) {
    w.name = { contains: f.nameContains.trim(), mode: "insensitive" };
  }

  const fitMin = f.fitMin != null && Number.isFinite(f.fitMin) ? f.fitMin : undefined;
  const fitMax = f.fitMax != null && Number.isFinite(f.fitMax) ? f.fitMax : undefined;
  if (fitMin !== undefined || fitMax !== undefined) {
    const score: Prisma.IntFilter = {};
    if (fitMin !== undefined) score.gte = fitMin;
    if (fitMax !== undefined) score.lte = fitMax;
    w.fitScore = score;
  }

  if (f.draftPending) {
    w.outreachDrafts = { some: { status: "PENDING_REVIEW" } };
  }

  return w;
}
