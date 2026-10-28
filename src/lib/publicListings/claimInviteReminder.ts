/**
 * One-time claim-invite reminder. Never a second chase.
 * Original invite + at most one reminder. Safety gates stay identical to first send.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const CLAIM_INVITE_REMINDER_NEVER_CLICKED_MIN_DAYS = 7;
export const CLAIM_INVITE_REMINDER_CLICKED_MIN_DAYS = 3;
export const CLAIM_INVITE_REMINDERS_PER_CRON_MAX = 2;
export const CLAIM_INVITE_REMINDER_EVENT = "CLAIM_INVITE_REMINDER_SENT";

const CLICK_EVENTS = new Set(["CLAIM_INVITE_OPENED", "CLAIM_PAGE_REACHED", "CLAIM_FORM_STARTED"]);
const COMPLETE_EVENTS = new Set([
  "CLAIM_AUTO_APPROVED",
  "CLAIM_SUBMITTED_MANUAL_REVIEW",
  "CLAIM_SUBMIT_ATTEMPT",
]);

export type ClaimInviteReminderLane = "clicked_not_completed" | "never_clicked";

export function claimInviteReminderEligibility(input: {
  sentAt: Date | null;
  claimed: boolean;
  alreadyReminded: boolean;
  bounced: boolean;
  complained: boolean;
  unsubscribed: boolean;
  clicked: boolean;
  completed: boolean;
  now?: Date;
}): { eligible: boolean; lane?: ClaimInviteReminderLane; reason?: string } {
  if (!input.sentAt) return { eligible: false, reason: "not_sent" };
  if (input.claimed) return { eligible: false, reason: "already_claimed" };
  if (input.alreadyReminded) return { eligible: false, reason: "already_reminded" };
  if (input.bounced) return { eligible: false, reason: "bounced" };
  if (input.complained) return { eligible: false, reason: "complained" };
  if (input.unsubscribed) return { eligible: false, reason: "unsubscribed" };
  if (input.completed) return { eligible: false, reason: "already_completed" };

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.sentAt.getTime();
  const minDays = input.clicked
    ? CLAIM_INVITE_REMINDER_CLICKED_MIN_DAYS
    : CLAIM_INVITE_REMINDER_NEVER_CLICKED_MIN_DAYS;
  if (ageMs < minDays * 86_400_000) {
    return { eligible: false, reason: "too_recent" };
  }

  return {
    eligible: true,
    lane: input.clicked ? "clicked_not_completed" : "never_clicked",
  };
}

export function reminderLanePriority(lane: ClaimInviteReminderLane): number {
  return lane === "clicked_not_completed" ? 2 : 1;
}

export function classifyClaimInviteEngagement(eventTypes: string[]): {
  clicked: boolean;
  completed: boolean;
  reminded: boolean;
} {
  let clicked = false;
  let completed = false;
  let reminded = false;
  for (const t of eventTypes) {
    if (CLICK_EVENTS.has(t)) clicked = true;
    if (COMPLETE_EVENTS.has(t)) completed = true;
    if (t === CLAIM_INVITE_REMINDER_EVENT) reminded = true;
  }
  return { clicked, completed, reminded };
}

export async function listingAlreadyReceivedClaimReminder(
  prisma: PrismaClient,
  listingId: string,
): Promise<boolean> {
  const n = await prisma.listingClaimAuditEvent.count({
    where: { listingId, eventType: CLAIM_INVITE_REMINDER_EVENT },
  });
  return n > 0;
}
