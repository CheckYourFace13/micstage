/**
 * Spread growth outreach sends across US daytime instead of exhausting the daily cap in a few ticks.
 * Window and cron interval are env-tunable; defaults match Hostinger 15-min tick + Chicago business hours.
 */
import { DateTime } from "luxon";
import { parseIntEnv } from "@/lib/marketing/emailConfig";

const CHICAGO = "America/Chicago";

export function outreachSendWindowStartHourChicago(): number {
  return parseIntEnv("GROWTH_OUTREACH_SEND_WINDOW_START_HOUR", 8);
}

export function outreachSendWindowEndHourChicago(): number {
  return parseIntEnv("GROWTH_OUTREACH_SEND_WINDOW_END_HOUR", 20);
}

export function outreachCronIntervalMinutes(): number {
  return parseIntEnv("GROWTH_OUTREACH_CRON_INTERVAL_MINUTES", 15);
}

export type OutreachSendPacing = {
  inSendWindow: boolean;
  chicagoHour: number;
  chicagoMinute: number;
  windowStartHour: number;
  windowEndHour: number;
  remainingCronTicksInWindow: number;
  remainingDailyBudget: number;
  configuredMaxPerCron: number;
  /** Effective max outreach sends this cron after daytime spread. */
  sendsThisCron: number;
  reason: string;
};

function remainingCronTicksInChicagoWindow(now: DateTime, endHour: number, intervalMin: number): number {
  const windowEnd = now.startOf("day").plus({ hours: endHour });
  const bucketMin = Math.floor(now.minute / intervalMin) * intervalMin;
  let cursor = now.set({ minute: bucketMin, second: 0, millisecond: 0 });
  let ticks = 0;
  while (cursor < windowEnd) {
    ticks += 1;
    cursor = cursor.plus({ minutes: intervalMin });
  }
  return ticks;
}

/**
 * Evenly spread remaining daily outreach budget across remaining tick slots in the send window.
 * Example: 50 remaining over 48 fifteen-minute ticks → ceil(50/48)=2 sends/tick (not 5).
 */
export function computeOutreachSendPacing(input: {
  now?: Date;
  remainingDailyBudget: number;
  configuredMaxPerCron: number;
}): OutreachSendPacing {
  const now = input.now ?? new Date();
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(CHICAGO);
  const startHour = outreachSendWindowStartHourChicago();
  const endHour = outreachSendWindowEndHourChicago();
  const intervalMin = outreachCronIntervalMinutes();
  const hour = dt.hour;
  const minute = dt.minute;
  const inSendWindow = hour >= startHour && hour < endHour;
  const remaining = Math.max(0, input.remainingDailyBudget);
  const configured = Math.max(0, input.configuredMaxPerCron);

  const remainingTicks = inSendWindow ? remainingCronTicksInChicagoWindow(dt, endHour, intervalMin) : 0;

  let sendsThisCron = 0;
  let reason: string;

  if (!inSendWindow) {
    reason = `outside_send_window (Chicago ${hour}:${String(minute).padStart(2, "0")}, allowed ${startHour}:00–${endHour}:00)`;
  } else if (remaining <= 0) {
    reason = "daily_budget_exhausted";
  } else if (configured <= 0) {
    reason = "configured_per_cron_zero";
  } else if (remainingTicks <= 0) {
    reason = "no_ticks_left_in_window";
  } else {
    const evenSpread = Math.ceil(remaining / remainingTicks);
    sendsThisCron = Math.min(configured, evenSpread);
    reason = `paced_spread: min(configured=${configured}, ceil(${remaining}/${remainingTicks})=${evenSpread})`;
  }

  return {
    inSendWindow,
    chicagoHour: hour,
    chicagoMinute: minute,
    windowStartHour: startHour,
    windowEndHour: endHour,
    remainingCronTicksInWindow: remainingTicks,
    remainingDailyBudget: remaining,
    configuredMaxPerCron: configured,
    sendsThisCron,
    reason,
  };
}
