export type OwnerAttentionItem = { code: string; message: string };

export type OwnerAttentionInput = {
  outreachEnabled: boolean;
  killSwitch: boolean;
  emailsSentToday: number;
  dailyCap: number;
  providerHeadroom: number;
  bounceRate: number;
  complaintRate: number;
  autoSendReady: number;
  leadsCreatedToday: number;
  listingsCreatedToday: number;
  needsReviewCount: number;
  autoVerifiedToday: number;
  autoRejectedToday: number;
  inviteReady: number;
  claimInvitesSentToday: number;
  unclaimedVerified: number;
  indexableScheduledListings: number;
  schedulesAutoConfirmedToday: number;
  lastTickAgeHours: number | null;
  netEligibleOutreach: number;
  chicagoHour: number | null;
  unscheduledVerified: number;
  uniqueClicks7d: number;
  registrations7d: number;
  claims7d: number;
  junkCandidateRate: number;
};

export function buildOwnerAttentionItems(input: OwnerAttentionInput): OwnerAttentionItem[] {
  const items: OwnerAttentionItem[] = [];
  if (input.lastTickAgeHours != null && input.lastTickAgeHours > 2) {
    items.push({ code: "cron_missing", message: `Growth tick last ran ${input.lastTickAgeHours.toFixed(1)}h ago` });
  }
  if (input.killSwitch) {
    items.push({ code: "kill_switch", message: "Outreach kill switch is on" });
  } else if (!input.outreachEnabled) {
    items.push({ code: "outreach_disabled", message: "Outreach is disabled" });
  }
  const safeTarget = Math.max(0, Math.min(input.dailyCap, input.dailyCap + input.providerHeadroom));
  if (
    input.outreachEnabled &&
    !input.killSwitch &&
    input.autoSendReady >= 20 &&
    input.emailsSentToday < Math.min(10, Math.max(4, Math.floor(safeTarget * 0.25)))
  ) {
    items.push({
      code: "outreach_below_capacity",
      message: `Outreach sent ${input.emailsSentToday} vs safe target ~${safeTarget} (${input.autoSendReady} send-ready)`,
    });
  }
  if (input.providerHeadroom <= 0) {
    items.push({ code: "provider_cap", message: "Resend daily headroom is exhausted" });
  }
  if (input.complaintRate > 0) {
    items.push({ code: "complaints", message: `Complaint rate ${(input.complaintRate * 100).toFixed(3)}%` });
  }
  if (input.bounceRate >= 0.03) {
    items.push({ code: "bounces", message: `Hard bounce rate ${(input.bounceRate * 100).toFixed(2)}%` });
  }
  if (input.leadsCreatedToday === 0) {
    items.push({ code: "discovery_stopped", message: "No new growth leads in the last 24h" });
  }
  if (
    input.needsReviewCount >= 200 &&
    input.autoVerifiedToday === 0 &&
    input.autoRejectedToday === 0 &&
    input.listingsCreatedToday > 0
  ) {
    items.push({
      code: "processing_stalled",
      message: `Processing produced 0 verifies and 0 rejects while ${input.listingsCreatedToday} listings were created (NEEDS_REVIEW=${input.needsReviewCount})`,
    });
  }
  if (input.junkCandidateRate >= 0.25 && input.listingsCreatedToday + input.autoRejectedToday >= 8) {
    items.push({
      code: "junk_rate",
      message: `Junk candidate rate ${(input.junkCandidateRate * 100).toFixed(0)}% — classifier is rejecting a large share`,
    });
  }
  if (
    input.chicagoHour != null &&
    input.chicagoHour >= 20 &&
    input.outreachEnabled &&
    !input.killSwitch &&
    input.netEligibleOutreach > 0 &&
    input.providerHeadroom > 0 &&
    input.emailsSentToday < Math.min(input.dailyCap, input.emailsSentToday + input.providerHeadroom)
  ) {
    items.push({
      code: "unused_outreach",
      message: `${input.netEligibleOutreach} eligible contacts unused at end of send window (${input.emailsSentToday} sent, ${input.providerHeadroom} headroom)`,
    });
  }
  if (input.unclaimedVerified > 100 && input.inviteReady === 0 && input.claimInvitesSentToday === 0) {
    items.push({
      code: "claim_invite_blocked",
      message: `${input.unclaimedVerified} verified unclaimed listings and 0 invite-ready contacts`,
    });
  }
  if (input.schedulesAutoConfirmedToday === 0 && input.unscheduledVerified > 50) {
    items.push({
      code: "schedule_enrichment",
      message: `0 schedules confirmed in 24h while ${input.unscheduledVerified} verified listings still lack an active schedule`,
    });
  }
  if (input.uniqueClicks7d > 0 && input.registrations7d === 0 && input.claims7d === 0) {
    items.push({
      code: "clicks_no_convert",
      message: `${input.uniqueClicks7d} unique clicks in 7 days but 0 registrations and 0 claims`,
    });
  }
  return items;
}
