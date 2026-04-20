import type {
  GrowthLeadAcquisitionStage,
  GrowthLeadContactQuality,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  GrowthLeadStatus,
  GrowthLeadType,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

/** Narrow admin queues without a second table or pipeline. */
export type GrowthLeadOutreachQueue =
  | "all"
  | "email_pipeline"
  | "email_outreach_ready"
  | "valid_high_medium_email"
  | "blocked_low_confidence_email"
  | "blocked_invalid_email"
  | "no_primary_email"
  | "contact_path_queue"
  | "social_path_queue"
  | "website_only_queue";

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
  openMicSignalTier?: GrowthLeadOpenMicSignalTier | null;
  contactQuality?: GrowthLeadContactQuality | null;
  acquisitionStage?: GrowthLeadAcquisitionStage | null;
  /** When true, restricts to DISCOVERED | REVIEWED | APPROVED (ignores `statuses`). */
  pipelineOnly?: boolean;
  /** When true, only leads with at least one PENDING_REVIEW outreach draft. */
  draftPending?: boolean;
  /**
   * Primary vs secondary outreach queues. Does not delete data — filters the list only.
   * `email_outreach_ready` adds status + confidence gates (marketing suppression still enforced at send time).
   */
  outreachQueue?: GrowthLeadOutreachQueue | null;
};

export function buildGrowthLeadWhere(f: GrowthLeadListFilters): Prisma.GrowthLeadWhereInput {
  const w: Prisma.GrowthLeadWhereInput = {};
  const extraAnd: Prisma.GrowthLeadWhereInput[] = [];

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

  const queue = f.outreachQueue ?? "all";
  if (queue === "email_pipeline") {
    extraAnd.push({
      contactQuality: "EMAIL",
      contactEmailNormalized: { not: null },
      contactEmailConfidence: { in: ["HIGH", "MEDIUM"] },
    });
  } else if (queue === "email_outreach_ready") {
    extraAnd.push({
      contactQuality: "EMAIL",
      contactEmailNormalized: { not: null },
      contactEmailConfidence: { in: ["HIGH", "MEDIUM"] },
      status: { notIn: ["BOUNCED", "UNSUBSCRIBED", "REJECTED", "JOINED"] },
      OR: [{ discoveryConfidence: null }, { discoveryConfidence: { gte: 25 } }],
    });
  } else if (queue === "valid_high_medium_email") {
    extraAnd.push({
      contactEmailNormalized: { not: null },
      contactEmailConfidence: { in: ["HIGH", "MEDIUM"] },
    });
  } else if (queue === "blocked_low_confidence_email") {
    extraAnd.push({
      contactEmailNormalized: { not: null },
      contactEmailConfidence: "LOW",
    });
  } else if (queue === "blocked_invalid_email") {
    extraAnd.push({
      contactEmailRejectionReason: { not: null },
    });
  } else if (queue === "no_primary_email") {
    extraAnd.push({ contactEmailNormalized: null });
  } else if (queue === "contact_path_queue") {
    extraAnd.push({ contactQuality: "CONTACT_PAGE" });
  } else if (queue === "social_path_queue") {
    extraAnd.push({ contactQuality: "SOCIAL_OR_CALENDAR" });
  } else if (queue === "website_only_queue") {
    extraAnd.push({ contactQuality: "WEBSITE_ONLY" });
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

  if (f.openMicSignalTier) {
    w.openMicSignalTier = f.openMicSignalTier;
  }

  if (f.contactQuality) {
    w.contactQuality = f.contactQuality;
  }

  if (f.acquisitionStage) {
    w.acquisitionStage = f.acquisitionStage;
  }

  if (extraAnd.length > 0) {
    w.AND = Array.isArray(w.AND) ? [...w.AND, ...extraAnd] : w.AND ? [w.AND, ...extraAnd] : extraAnd;
  }

  return w;
}
