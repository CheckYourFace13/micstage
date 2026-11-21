import { DateTime } from "luxon";

const ZONE = "America/Chicago";

/**
 * Rolling last 24 hours ending at `now`, interpreted in America/Chicago for display boundaries.
 * Kept for ops that still need a 24h slice; owner summary uses {@link chicagoLast7dWindow}.
 */
export function chicagoLast24hWindow(now: Date = new Date()): {
  startUtc: Date;
  endUtc: Date;
  /** YYYY-MM-DD in Chicago at `now` (for subject / idempotency). */
  reportChicagoDate: string;
  /** Human label e.g. "Apr 9, 2026" */
  reportLabel: string;
} {
  const end = DateTime.fromJSDate(now, { zone: "utc" }).setZone(ZONE);
  const start = end.minus({ hours: 24 });
  return {
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    reportChicagoDate: end.toISODate() ?? "",
    reportLabel: end.toLocaleString(DateTime.DATE_MED),
  };
}

/** Prior 7 days ending at `now` (America/Chicago) for the weekly owner summary. */
export function chicagoLast7dWindow(now: Date = new Date()): {
  startUtc: Date;
  endUtc: Date;
  reportChicagoDate: string;
  reportLabel: string;
} {
  const end = DateTime.fromJSDate(now, { zone: "utc" }).setZone(ZONE);
  const start = end.minus({ days: 7 });
  return {
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    reportChicagoDate: end.toISODate() ?? "",
    reportLabel: end.toLocaleString(DateTime.DATE_MED),
  };
}

/**
 * Chicago ISO week key for owner-summary idempotency (one send per week).
 * Example: `2026-W47`.
 */
export function chicagoOwnerSummaryWeekKey(now: Date = new Date()): string {
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(ZONE);
  const weekYear = dt.weekYear;
  const week = String(dt.weekNumber).padStart(2, "0");
  return `${weekYear}-W${week}`;
}

/**
 * Weekly owner summary window: Friday 6:05–6:19 PM America/Chicago.
 * Hostinger should hit only Friday (UTC crons for CST + CDT); this gate is the
 * hard server-side schedule. Accidental Mon–Thu/Sat/Sun or off-window calls skip.
 * Rollback to daily: `hour === 8 && minute < 15` every weekday.
 */
export function shouldAutoSendDailyOwnerSummary(now: Date = new Date()): {
  shouldSend: boolean;
  chicagoDate: string;
  chicagoWeek: string;
  chicagoWeekday: number;
  chicagoHour: number;
  chicagoMinute: number;
} {
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(ZONE);
  const chicagoDate = dt.toISODate() ?? "";
  const chicagoWeek = chicagoOwnerSummaryWeekKey(now);
  const hour = dt.hour;
  const minute = dt.minute;
  // Luxon: Monday = 1 … Friday = 5
  const shouldSend = dt.weekday === 5 && hour === 18 && minute >= 5 && minute < 20;
  return {
    shouldSend,
    chicagoDate,
    chicagoWeek,
    chicagoWeekday: dt.weekday,
    chicagoHour: hour,
    chicagoMinute: minute,
  };
}

/** Prior daily schedule (for ops rollback notes). */
export const OWNER_SUMMARY_DAILY_ROLLBACK = {
  chicagoWindow: "08:00–08:14 America/Chicago every day",
  hostingerCron: "5 * * * * → /api/cron/daily-owner-summary",
} as const;

/** Current Hostinger Friday schedule (UTC; covers CST + CDT). */
export const OWNER_SUMMARY_FRIDAY_HOSTINGER = {
  chicagoWindow: "Friday 18:05–18:19 America/Chicago",
  hostingerCrons: [
    "5 23 * * 5 → /api/cron/daily-owner-summary (CDT Friday 6:05 PM)",
    "5 0 * * 6 → /api/cron/daily-owner-summary (CST Friday 6:05 PM)",
  ],
} as const;
