import { DateTime } from "luxon";

const ZONE = "America/Chicago";

/**
 * Rolling last 24 hours ending at `now`, interpreted in America/Chicago for display boundaries.
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

/** Whether automatic daily send should run (8:00–8:14 AM Chicago). */
export function shouldAutoSendDailyOwnerSummary(now: Date = new Date()): {
  shouldSend: boolean;
  chicagoDate: string;
  chicagoHour: number;
  chicagoMinute: number;
} {
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(ZONE);
  const chicagoDate = dt.toISODate() ?? "";
  const hour = dt.hour;
  const minute = dt.minute;
  const shouldSend = hour === 8 && minute < 15;
  return { shouldSend, chicagoDate, chicagoHour: hour, chicagoMinute: minute };
}
