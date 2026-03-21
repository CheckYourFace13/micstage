import { sendEmail } from "@/lib/mailer";
import { requirePrisma } from "@/lib/prisma";
import { slotStartInstant } from "@/lib/venueBookingRules";
import { DateTime } from "luxon";

const MS_H = 60 * 60 * 1000;

/** Slot start is between ~23h and ~25h from now → send “tomorrow” reminder. */
export const REMINDER_24H_WINDOW_MS = { min: 23 * MS_H, max: 25 * MS_H };
/** Slot start is between ~1.5h and ~2.5h from now → send “soon” reminder. */
export const REMINDER_2H_WINDOW_MS = { min: 1.5 * MS_H, max: 2.5 * MS_H };

function appUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(baseUtcMidnight: Date, days: number): Date {
  return new Date(baseUtcMidnight.getTime() + days * 86400000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recipientEmail(booking: {
  musician: { email: string } | null;
  performerEmail: string | null;
}): string | null {
  const m = booking.musician?.email?.trim();
  if (m) return m;
  const p = booking.performerEmail?.trim();
  return p || null;
}

function formatShowTime(instanceDate: Date, startMin: number, timeZone: string): string {
  const tz = timeZone?.trim() || "America/Chicago";
  const ymd = instanceDate.toISOString().slice(0, 10);
  const dt = DateTime.fromISO(`${ymd}T00:00:00`, { zone: tz }).plus({ minutes: startMin });
  if (!dt.isValid) return `${ymd} (local time)`;
  return dt.toFormat("cccc, LLL d, yyyy • h:mm a ZZZZ");
}

type ReminderKind = "24h" | "2h";

function subjectAndBody(
  kind: ReminderKind,
  ctx: {
    venueName: string;
    venueSlug: string;
    performerName: string;
    showLine: string;
  },
): { subject: string; html: string; text: string } {
  const when = kind === "24h" ? "Your show is tomorrow" : "Your show is coming up soon";
  const detail = kind === "24h" ? "about 24 hours" : "about 2 hours";
  const url = `${appUrl()}/venues/${encodeURIComponent(ctx.venueSlug)}`;
  const subject = `${when} — ${ctx.venueName} (MicStage)`;
  const safeVenue = escapeHtml(ctx.venueName);
  const safePerformer = escapeHtml(ctx.performerName);
  const safeShow = escapeHtml(ctx.showLine);
  const html = `
    <p>Hi ${safePerformer},</p>
    <p>This is a reminder that you’re booked at <strong>${safeVenue}</strong> in <strong>${detail}</strong>.</p>
    <p><strong>When:</strong> ${safeShow}</p>
    <p><a href="${escapeHtml(url)}">View venue &amp; booking</a></p>
    <p style="color:#666;font-size:12px">MicStage booking reminder · you can manage bookings from your artist account or the venue page.</p>
  `.trim();
  const text = [
    `Hi ${ctx.performerName},`,
    ``,
    `Reminder: you're booked at ${ctx.venueName} in ${detail}.`,
    `When: ${ctx.showLine}`,
    ``,
    `Venue: ${url}`,
    ``,
    `— MicStage`,
  ].join("\n");
  return { subject, html, text };
}

function slotStartForBooking(booking: {
  slot: { startMin: number; instance: { date: Date; template: { timeZone: string } } };
}): Date {
  const { date, template } = booking.slot.instance;
  return slotStartInstant(date, booking.slot.startMin, template.timeZone);
}

function inWindow(slotStart: Date, now: Date, window: { min: number; max: number }): boolean {
  const delta = slotStart.getTime() - now.getTime();
  return delta > window.min && delta <= window.max;
}

export type BookingReminderJobResult = {
  sent24h: number;
  sent2h: number;
  skippedNoEmail: number;
  skippedOutsideWindow: number;
  skippedClaimRace: number;
  failures: number;
  failureMessages: string[];
};

/**
 * Sends due booking reminder emails (24h + 2h windows). Idempotent via `reminderEmail*SentAt` on `Booking`.
 * Intended to be called from a cron HTTP handler or an external scheduler.
 */
export async function runBookingReminderJob(now: Date = new Date()): Promise<BookingReminderJobResult> {
  const prisma = requirePrisma();
  const result: BookingReminderJobResult = {
    sent24h: 0,
    sent2h: 0,
    skippedNoEmail: 0,
    skippedOutsideWindow: 0,
    skippedClaimRace: 0,
    failures: 0,
    failureMessages: [],
  };

  const dayStart = utcMidnight(now);
  const dateGte = addUtcDays(dayStart, -1);
  const dateLte = addUtcDays(dayStart, 10);

  const baseInclude = {
    musician: { select: { email: true, stageName: true } },
    slot: {
      include: {
        instance: {
          include: {
            template: {
              include: {
                venue: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    },
  } as const;

  const candidates24 = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      reminderEmail24hSentAt: null,
      slot: {
        instance: {
          isCancelled: false,
          date: { gte: dateGte, lte: dateLte },
        },
      },
    },
    include: baseInclude,
    take: 250,
  });

  const candidates2 = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      reminderEmail2hSentAt: null,
      slot: {
        instance: {
          isCancelled: false,
          date: { gte: dateGte, lte: dateLte },
        },
      },
    },
    include: baseInclude,
    take: 250,
  });

  for (const booking of candidates24) {
    const slotStart = slotStartForBooking(booking);
    if (slotStart.getTime() <= now.getTime()) {
      result.skippedOutsideWindow++;
      continue;
    }
    if (!inWindow(slotStart, now, REMINDER_24H_WINDOW_MS)) {
      result.skippedOutsideWindow++;
      continue;
    }
    const to = recipientEmail(booking);
    if (!to) {
      result.skippedNoEmail++;
      continue;
    }

    try {
      const claimed = await prisma.booking.updateMany({
        where: {
          id: booking.id,
          cancelledAt: null,
          reminderEmail24hSentAt: null,
          slot: { instance: { isCancelled: false } },
        },
        data: { reminderEmail24hSentAt: now },
      });
      if (claimed.count !== 1) {
        result.skippedClaimRace++;
        continue;
      }

      const fresh = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: baseInclude,
      });
      if (!fresh || fresh.cancelledAt || fresh.slot.instance.isCancelled) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderEmail24hSentAt: null },
        });
        result.skippedOutsideWindow++;
        continue;
      }

      const venue = fresh.slot.instance.template.venue;
      const showLine = formatShowTime(
        fresh.slot.instance.date,
        fresh.slot.startMin,
        fresh.slot.instance.template.timeZone,
      );
      const { subject, html, text } = subjectAndBody("24h", {
        venueName: venue.name,
        venueSlug: venue.slug,
        performerName: fresh.performerName,
        showLine,
      });
      await sendEmail({ to, subject, html, text });
      result.sent24h++;
    } catch (e) {
      result.failures++;
      result.failureMessages.push(
        e instanceof Error ? e.message : String(e),
      );
      try {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderEmail24hSentAt: null },
        });
      } catch {
        /* ignore */
      }
    }
  }

  for (const booking of candidates2) {
    const slotStart = slotStartForBooking(booking);
    if (slotStart.getTime() <= now.getTime()) {
      result.skippedOutsideWindow++;
      continue;
    }
    if (!inWindow(slotStart, now, REMINDER_2H_WINDOW_MS)) {
      result.skippedOutsideWindow++;
      continue;
    }
    const to = recipientEmail(booking);
    if (!to) {
      result.skippedNoEmail++;
      continue;
    }

    try {
      const claimed = await prisma.booking.updateMany({
        where: {
          id: booking.id,
          cancelledAt: null,
          reminderEmail2hSentAt: null,
          slot: { instance: { isCancelled: false } },
        },
        data: { reminderEmail2hSentAt: now },
      });
      if (claimed.count !== 1) {
        result.skippedClaimRace++;
        continue;
      }

      const fresh = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: baseInclude,
      });
      if (!fresh || fresh.cancelledAt || fresh.slot.instance.isCancelled) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderEmail2hSentAt: null },
        });
        result.skippedOutsideWindow++;
        continue;
      }

      const venue = fresh.slot.instance.template.venue;
      const showLine = formatShowTime(
        fresh.slot.instance.date,
        fresh.slot.startMin,
        fresh.slot.instance.template.timeZone,
      );
      const { subject, html, text } = subjectAndBody("2h", {
        venueName: venue.name,
        venueSlug: venue.slug,
        performerName: fresh.performerName,
        showLine,
      });
      await sendEmail({ to, subject, html, text });
      result.sent2h++;
    } catch (e) {
      result.failures++;
      result.failureMessages.push(
        e instanceof Error ? e.message : String(e),
      );
      try {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderEmail2hSentAt: null },
        });
      } catch {
        /* ignore */
      }
    }
  }

  return result;
}
