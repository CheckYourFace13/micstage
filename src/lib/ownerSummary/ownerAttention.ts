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
  needsReviewCount: number;
  autoVerifiedToday: number;
  inviteReady: number;
  claimInvitesSentToday: number;
  unclaimedVerified: number;
  indexableScheduledListings: number;
  schedulesAutoConfirmedToday: number;
  lastTickAgeHours: number | null;
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
  if (input.needsReviewCount >= 200 && input.autoVerifiedToday === 0) {
    items.push({
      code: "verification_backlog",
      message: `NEEDS_REVIEW is ${input.needsReviewCount} with 0 auto-verified today`,
    });
  }
  if (input.unclaimedVerified >= 50 && input.inviteReady === 0 && input.claimInvitesSentToday === 0) {
    items.push({
      code: "claim_invite_blocked",
      message: `${input.unclaimedVerified} verified unclaimed listings and 0 invite-ready contacts`,
    });
  }
  if (
    input.indexableScheduledListings === 0 &&
    input.schedulesAutoConfirmedToday === 0
  ) {
    items.push({
      code: "schedule_enrichment",
      message: "No indexable scheduled listings; schedule confirmation produced 0 rows today",
    });
  }
  return items;
}
