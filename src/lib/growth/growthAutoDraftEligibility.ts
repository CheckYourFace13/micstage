import type { GrowthLead } from "@/generated/prisma/client";
import { growthAutoDraftFitMin } from "@/lib/growth/expansionConfig";

/** Mirrors venue branch of `runAutoGrowthOutreachDrafts` candidate OR (excluding draft-exists check). */
export function venueLeadMatchesAutoDraftHeuristic(
  lead: Pick<
    GrowthLead,
    "leadType" | "status" | "fitScore" | "openMicSignalTier" | "contactEmailNormalized" | "contactEmailConfidence"
  >,
): boolean {
  if (lead.leadType !== "VENUE") return false;
  if (!lead.contactEmailNormalized) return false;
  if (lead.contactEmailConfidence === "LOW") return false;

  const fitMin = growthAutoDraftFitMin();
  const venueAutoFitMin = Math.max(6, fitMin - 1);

  if (lead.status === "APPROVED") return true;
  if (lead.status === "REVIEWED" && (lead.fitScore ?? 0) >= fitMin) return true;
  if (
    lead.status === "DISCOVERED" &&
    (lead.fitScore ?? 0) >= venueAutoFitMin &&
    (lead.openMicSignalTier === "EXPLICIT_OPEN_MIC" || lead.openMicSignalTier === "STRONG_LIVE_EVENT")
  ) {
    return true;
  }
  return false;
}
