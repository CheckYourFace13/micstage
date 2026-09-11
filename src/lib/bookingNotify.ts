import { sendEmail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/publicSeo";

/**
 * Best-effort transactional notices after a public booking.
 * Never throws to the booking path — booking must succeed even if mail fails.
 */
export async function notifyBookingCreated(input: {
  performerName: string;
  performerEmail: string | null;
  hostOrVenueEmail: string | null;
  hostOrVenueLabel: string;
  venueName: string;
  whenLabel: string;
  lineupPath: string;
}): Promise<{ performer: boolean; host: boolean }> {
  const lineupUrl = absoluteUrl(input.lineupPath);
  let performer = false;
  let host = false;

  if (input.performerEmail?.includes("@")) {
    try {
      await sendEmail({
        to: input.performerEmail,
        subject: `You're on the lineup — ${input.venueName}`,
        text: `Hi ${input.performerName},\n\nYou're booked for ${input.whenLabel} at ${input.venueName}.\n\nLineup: ${lineupUrl}\n\n— MicStage`,
        html: `<p>Hi ${escapeHtml(input.performerName)},</p><p>You're booked for <strong>${escapeHtml(input.whenLabel)}</strong> at <strong>${escapeHtml(input.venueName)}</strong>.</p><p><a href="${lineupUrl}">View lineup</a></p><p>— MicStage</p>`,
      });
      performer = true;
    } catch (e) {
      console.error("[booking-notify] performer confirmation failed", e);
    }
  }

  if (input.hostOrVenueEmail?.includes("@")) {
    try {
      await sendEmail({
        to: input.hostOrVenueEmail,
        subject: `New signup — ${input.performerName} at ${input.venueName}`,
        text: `${input.performerName} signed up for ${input.whenLabel} at ${input.venueName}.\n\nManage lineup: ${lineupUrl}\n\n— MicStage`,
        html: `<p><strong>${escapeHtml(input.performerName)}</strong> signed up for <strong>${escapeHtml(input.whenLabel)}</strong> at <strong>${escapeHtml(input.venueName)}</strong>.</p><p><a href="${lineupUrl}">Manage lineup</a></p><p>— MicStage</p>`,
      });
      host = true;
    } catch (e) {
      console.error("[booking-notify] host/venue notice failed", e);
    }
  }

  return { performer, host };
}

/** Best-effort notice when Host/Venue moves a performer to a new start time. */
export async function notifyBookingTimeChanged(input: {
  performerName: string;
  performerEmail: string | null;
  venueName: string;
  fromLabel: string;
  toLabel: string;
  lineupPath: string;
}): Promise<boolean> {
  if (!input.performerEmail?.includes("@")) return false;
  const lineupUrl = absoluteUrl(input.lineupPath);
  try {
    await sendEmail({
      to: input.performerEmail,
      subject: `Your start time changed — ${input.venueName}`,
      text: `Hi ${input.performerName},\n\nYour set time at ${input.venueName} moved from ${input.fromLabel} to ${input.toLabel}.\n\nLineup: ${lineupUrl}\n\n— MicStage`,
      html: `<p>Hi ${escapeHtml(input.performerName)},</p><p>Your set time at <strong>${escapeHtml(input.venueName)}</strong> moved from <strong>${escapeHtml(input.fromLabel)}</strong> to <strong>${escapeHtml(input.toLabel)}</strong>.</p><p><a href="${lineupUrl}">View lineup</a></p><p>— MicStage</p>`,
    });
    return true;
  } catch (e) {
    console.error("[booking-notify] time-change notice failed", e);
    return false;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
