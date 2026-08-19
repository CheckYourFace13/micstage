/**
 * Autonomous growth operating states. These are not a human review queue.
 *
 * AUTO_SEND_READY — identity + current evidence + HIGH contact; automation may send
 * AUTO_RESEARCH_RETRY — plausible but unresolved; crawl/retry until proven or rejected
 * HARD_REJECT — directory/service/geo/junk; do not recrawl unless identity data changes
 */
import type { OutreachTargetDecision } from "@/lib/growth/outreachTargetIdentity";
import type { PermanentSkipReason } from "@/lib/growth/outreachEvidenceCrawl";

export type GrowthOpsState = "AUTO_SEND_READY" | "AUTO_RESEARCH_RETRY" | "HARD_REJECT";

export type GrowthOpsClassification = {
  state: GrowthOpsState;
  reason: string;
};

export function classifyGrowthOpsState(input: {
  hardReject: PermanentSkipReason | null;
  identityDecision: OutreachTargetDecision;
  evidenceAutoSend: boolean;
  contactHigh: boolean;
}): GrowthOpsClassification {
  if (input.hardReject) {
    return { state: "HARD_REJECT", reason: input.hardReject };
  }
  const identityOk =
    input.identityDecision === "eligible_venue" || input.identityDecision === "eligible_promoter";
  if (identityOk && input.evidenceAutoSend && input.contactHigh) {
    return { state: "AUTO_SEND_READY", reason: "qualified_evidence_and_contact" };
  }
  if (identityOk && input.evidenceAutoSend && !input.contactHigh) {
    return { state: "AUTO_RESEARCH_RETRY", reason: "qualified_evidence_missing_high_contact" };
  }
  if (identityOk && !input.evidenceAutoSend) {
    return { state: "AUTO_RESEARCH_RETRY", reason: "eligible_identity_missing_evidence" };
  }
  // Ambiguous identity (formerly "manual review") keeps researching — never a human queue.
  if (input.identityDecision === "manual_review") {
    return { state: "AUTO_RESEARCH_RETRY", reason: "ambiguous_identity_research" };
  }
  return { state: "AUTO_RESEARCH_RETRY", reason: "unresolved_plausible_target" };
}

/** Former human-review bucket: research unless it is already a hard reject. */
export function reclassifyFormerManualReview(input: {
  hardReject: PermanentSkipReason | null;
  identityDecision: OutreachTargetDecision;
  evidenceAutoSend: boolean;
  contactHigh: boolean;
}): GrowthOpsClassification {
  const classified = classifyGrowthOpsState(input);
  if (classified.state === "HARD_REJECT") return classified;
  if (classified.state === "AUTO_SEND_READY") return classified;
  return { state: "AUTO_RESEARCH_RETRY", reason: classified.reason };
}

export function scoreResearchPriority(input: {
  opsState: GrowthOpsState | null;
  skipPermanent: boolean;
  hasWebsite: boolean;
  googlePlaceId: boolean;
  openMicSignalTier: string | null;
  contactHigh: boolean;
  evidenceAutoSend: boolean;
  leadType?: "VENUE" | "PROMOTER_ACCOUNT" | "ARTIST";
  hostOutreachLane?: boolean;
  hostMultiVenueProspect?: boolean;
  hostIdentityDetected?: boolean;
}): number {
  if (input.skipPermanent || input.opsState === "HARD_REJECT") return -1;
  if (!input.hasWebsite) return 5;
  // Growth priority queue: Host multi-venue → Host lane → proven mic + host → venue contact gap → retry → send-ready.
  if (input.hostMultiVenueProspect && input.hostOutreachLane) return 125;
  if (input.hostMultiVenueProspect) return 120;
  if (input.leadType === "PROMOTER_ACCOUNT" && input.hostOutreachLane && input.contactHigh) return 115;
  if (input.hostOutreachLane && input.hostIdentityDetected && input.evidenceAutoSend) return 112;
  if (input.hostOutreachLane && input.evidenceAutoSend) return 110;
  const likelyMic =
    input.openMicSignalTier === "EXPLICIT_OPEN_MIC" || input.openMicSignalTier === "STRONG_LIVE_EVENT";
  if (input.googlePlaceId && likelyMic && !input.evidenceAutoSend) return 100;
  if (input.hostIdentityDetected && likelyMic && !input.contactHigh) return 95;
  if (input.evidenceAutoSend && !input.contactHigh) return 90;
  if (input.contactHigh && !input.evidenceAutoSend) return 80;
  if (input.opsState === "AUTO_RESEARCH_RETRY" || input.opsState == null) return 60;
  if (input.opsState === "AUTO_SEND_READY") return 20;
  return 10;
}

export const GROWTH_OPS_NO_HUMAN_APPROVAL = true;
