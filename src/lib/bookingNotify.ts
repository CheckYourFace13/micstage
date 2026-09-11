import { sendEmail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/publicSeo";
import { requirePrisma } from "@/lib/prisma";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { minutesToTimeLabel } from "@/lib/time";

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

export type CancelNotifyInitiator = "performer" | "organizer";

export type BookingCancelNotifyContext = {
  bookingId: string;
  performerName: string;
  performerEmail: string | null;
  organizerEmail: string | null;
  organizerLabel: "Host" | "Venue";
  venueName: string;
  whenLabel: string;
  lineupPath: string;
  cancelled: boolean;
};

/**
 * Load cancel-notify context for a booking. Prefer musician account email when present.
 */
export async function loadBookingCancelNotifyContext(bookingId: string): Promise<BookingCancelNotifyContext | null> {
  const prisma = requirePrisma();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      cancelledAt: true,
      performerName: true,
      performerEmail: true,
      musician: { select: { email: true } },
      slot: {
        select: {
          startMin: true,
          instance: {
            select: {
              date: true,
              template: {
                select: {
                  promoterNightId: true,
                  venue: {
                    select: {
                      name: true,
                      slug: true,
                      owner: { select: { email: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!booking) return null;

  const nightId = booking.slot.instance.template.promoterNightId;
  const venue = booking.slot.instance.template.venue;
  const ymd = booking.slot.instance.date.toISOString().slice(0, 10);
  const timeLabel = minutesToTimeLabel(booking.slot.startMin);
  const whenLabel = `${ymd} · ${timeLabel}`;
  const lineupPath = nightId
    ? publicLineupPathForNightId(nightId)
    : `/venues/${venue.slug}/lineup/${ymd}`;

  let organizerEmail: string | null = null;
  if (nightId) {
    const night = await prisma.promoterNight.findUnique({
      where: { id: nightId },
      select: { series: { select: { promoter: { select: { email: true } } } } },
    });
    organizerEmail = night?.series.promoter.email ?? null;
  } else {
    organizerEmail = venue.owner?.email ?? null;
  }

  const performerEmail = usableEmail(booking.musician?.email) ?? usableEmail(booking.performerEmail);

  return {
    bookingId: booking.id,
    performerName: booking.performerName,
    performerEmail,
    organizerEmail: usableEmail(organizerEmail),
    organizerLabel: nightId ? "Host" : "Venue",
    venueName: venue.name,
    whenLabel,
    lineupPath,
    cancelled: booking.cancelledAt != null,
  };
}

/**
 * Send cancel/removal notices with claim stamps so retries cannot spam.
 * - performer initiator: performer confirmation + organizer “spot open again”
 * - organizer initiator: performer removal notice only (if email exists)
 * Never call for move/swap (MOVED_AWAY) — those use notifyBookingTimeChanged only.
 */
export async function notifyBookingCancelled(input: {
  bookingId: string;
  initiator: CancelNotifyInitiator;
  performerName: string;
  performerEmail: string | null;
  organizerEmail: string | null;
  organizerLabel: "Host" | "Venue";
  venueName: string;
  whenLabel: string;
  lineupPath: string;
}): Promise<{ performer: boolean; organizer: boolean }> {
  const prisma = requirePrisma();
  const lineupUrl = absoluteUrl(input.lineupPath);
  let performer = false;
  let organizer = false;

  const plan = planBookingCancelNotify({
    initiator: input.initiator,
    performerEmail: input.performerEmail,
    organizerEmail: input.organizerEmail,
  });

  if (plan.sendPerformer && input.performerEmail) {
    const claimed = await claimCancelStamp(prisma, input.bookingId, "cancelNotifyPerformerSentAt");
    if (claimed) {
      try {
        if (plan.performerKind === "confirm") {
          await sendEmail({
            to: input.performerEmail,
            subject: `Booking cancelled — ${input.venueName}`,
            text: `Hi ${input.performerName},\n\nYour booking for ${input.whenLabel} at ${input.venueName} is cancelled.\n\nLineup: ${lineupUrl}\n\n— MicStage`,
            html: `<p>Hi ${escapeHtml(input.performerName)},</p><p>Your booking for <strong>${escapeHtml(input.whenLabel)}</strong> at <strong>${escapeHtml(input.venueName)}</strong> is cancelled.</p><p><a href="${lineupUrl}">View lineup</a></p><p>— MicStage</p>`,
          });
        } else {
          await sendEmail({
            to: input.performerEmail,
            subject: `Your spot was cancelled — ${input.venueName}`,
            text: `Hi ${input.performerName},\n\nYour spot for ${input.whenLabel} at ${input.venueName} was cancelled by the ${input.organizerLabel.toLowerCase()}.\n\nLineup: ${lineupUrl}\n\n— MicStage`,
            html: `<p>Hi ${escapeHtml(input.performerName)},</p><p>Your spot for <strong>${escapeHtml(input.whenLabel)}</strong> at <strong>${escapeHtml(input.venueName)}</strong> was cancelled by the ${escapeHtml(input.organizerLabel.toLowerCase())}.</p><p><a href="${lineupUrl}">View lineup</a></p><p>— MicStage</p>`,
          });
        }
        performer = true;
      } catch (e) {
        console.error("[booking-notify] cancel performer notice failed", e);
        await clearCancelStamp(prisma, input.bookingId, "cancelNotifyPerformerSentAt");
      }
    }
  }

  if (plan.sendOrganizer && input.organizerEmail) {
    const claimed = await claimCancelStamp(prisma, input.bookingId, "cancelNotifyOrganizerSentAt");
    if (claimed) {
      try {
        await sendEmail({
          to: input.organizerEmail,
          subject: `Signup cancelled — ${input.performerName} at ${input.venueName}`,
          text: `${input.performerName} cancelled their booking for ${input.whenLabel} at ${input.venueName}. That start time is open again.\n\nManage lineup: ${lineupUrl}\n\n— MicStage`,
          html: `<p><strong>${escapeHtml(input.performerName)}</strong> cancelled their booking for <strong>${escapeHtml(input.whenLabel)}</strong> at <strong>${escapeHtml(input.venueName)}</strong>.</p><p>That start time is <strong>open again</strong>.</p><p><a href="${lineupUrl}">Manage lineup</a></p><p>— MicStage</p>`,
        });
        organizer = true;
      } catch (e) {
        console.error("[booking-notify] cancel organizer notice failed", e);
        await clearCancelStamp(prisma, input.bookingId, "cancelNotifyOrganizerSentAt");
      }
    }
  }

  return { performer, organizer };
}

/** Convenience: load context + notify after a successful CANCELLED soft-cancel. */
export async function notifyBookingCancelledById(
  bookingId: string,
  initiator: CancelNotifyInitiator,
): Promise<{ performer: boolean; organizer: boolean }> {
  const ctx = await loadBookingCancelNotifyContext(bookingId);
  if (!ctx || !ctx.cancelled) return { performer: false, organizer: false };
  return notifyBookingCancelled({
    bookingId: ctx.bookingId,
    initiator,
    performerName: ctx.performerName,
    performerEmail: ctx.performerEmail,
    organizerEmail: ctx.organizerEmail,
    organizerLabel: ctx.organizerLabel,
    venueName: ctx.venueName,
    whenLabel: ctx.whenLabel,
    lineupPath: ctx.lineupPath,
  });
}

type CancelStampField = "cancelNotifyPerformerSentAt" | "cancelNotifyOrganizerSentAt";

async function claimCancelStamp(
  prisma: ReturnType<typeof requirePrisma>,
  bookingId: string,
  field: CancelStampField,
): Promise<boolean> {
  const result = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      cancelledAt: { not: null },
      [field]: null,
    },
    data: { [field]: new Date() },
  });
  return result.count === 1;
}

async function clearCancelStamp(
  prisma: ReturnType<typeof requirePrisma>,
  bookingId: string,
  field: CancelStampField,
): Promise<void> {
  await prisma.booking.updateMany({
    where: { id: bookingId },
    data: { [field]: null },
  });
}

function usableEmail(email: string | null | undefined): string | null {
  const t = email?.trim() ?? "";
  return t.includes("@") ? t : null;
}

/** Pure plan for cancel emails — used by notify + unit tests. */
export function planBookingCancelNotify(input: {
  initiator: CancelNotifyInitiator;
  performerEmail: string | null | undefined;
  organizerEmail: string | null | undefined;
}): {
  sendPerformer: boolean;
  sendOrganizer: boolean;
  performerKind: "confirm" | "removed" | null;
} {
  const hasPerformer = Boolean(usableEmail(input.performerEmail));
  const hasOrganizer = Boolean(usableEmail(input.organizerEmail));
  if (input.initiator === "performer") {
    return {
      sendPerformer: hasPerformer,
      sendOrganizer: hasOrganizer,
      performerKind: hasPerformer ? "confirm" : null,
    };
  }
  return {
    sendPerformer: hasPerformer,
    sendOrganizer: false,
    performerKind: hasPerformer ? "removed" : null,
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
