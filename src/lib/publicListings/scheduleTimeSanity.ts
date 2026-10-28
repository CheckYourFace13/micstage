/**
 * Automated public-listing schedule sanity.
 * Suspicious times are TIME_UNCONFIRMED — never invent a replacement clock.
 */
import { DateTime } from "luxon";
import { MINUTES_PER_DAY, resolveScheduleEndMin } from "@/lib/scheduleWindow";

export const SUSPICIOUS_MORNING_START_MIN = 2 * 60; // 02:00
export const SUSPICIOUS_MORNING_END_EXCLUSIVE = 9 * 60; // 09:00
export const MAX_PUBLIC_OPEN_MIC_DURATION_MIN = 8 * 60;
export const TIME_UNCONFIRMED_PREFIX = "TIME_UNCONFIRMED";

export type ScheduleTimeSanityReason =
  | "morning_start_unconfirmed"
  | "duration_over_8h"
  | "impossible_window"
  | "timezone_unconfirmed"
  | "source_text_conflict";

export type ScheduleTimeSanityVerdict = {
  ok: boolean;
  reasons: ScheduleTimeSanityReason[];
};

const IANA_RE = /^[A-Za-z]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?$/;

export function isConfidentIanaTimeZone(zone: string | null | undefined): boolean {
  const z = zone?.trim() ?? "";
  if (!IANA_RE.test(z)) return false;
  try {
    return DateTime.now().setZone(z).isValid;
  } catch {
    return false;
  }
}

export function statedDurationMin(startTimeMin: number, endTimeMin: number | null | undefined): number | null {
  if (endTimeMin == null) return null;
  const resolved = endTimeMin <= startTimeMin ? endTimeMin + MINUTES_PER_DAY : endTimeMin;
  return resolved - startTimeMin;
}

function clockFromRaw(raw: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    let hour = Number.parseInt(m[1]!, 10);
    const min = m[2] ? Number.parseInt(m[2], 10) : 0;
    const ap = m[3]?.replace(/\./g, "").toLowerCase();
    if (!Number.isFinite(hour) || hour > 23 || min > 59) continue;
    if (ap === "am") hour = hour === 12 ? 0 : hour;
    else if (ap === "pm") hour = hour === 12 ? 12 : hour + 12;
    else if (hour <= 12 && !ap) continue;
    out.push(hour * 60 + min);
  }
  return out;
}

export function sourceTextConflictsParsedTime(input: {
  startTimeMin: number;
  endTimeMin: number | null;
  rawText?: string | null;
}): boolean {
  const raw = input.rawText?.trim() ?? "";
  if (raw.length < 8) return false;
  const iso = /(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(raw);
  if (iso) {
    const wall = Number.parseInt(iso[2]!, 10) * 60 + Number.parseInt(iso[3]!, 10);
    const start = ((input.startTimeMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (wall === 0) return true;
    return Math.abs(wall - start) > 1;
  }
  if (input.startTimeMin === 12 * 60 && /\b12\s*[-–to]+\s*\d{1,2}\s*p/i.test(raw)) return false;
  const clocks = clockFromRaw(raw);
  if (clocks.length === 0) return false;
  const start = ((input.startTimeMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const startMatches = clocks.some((c) => Math.abs(c - start) <= 1);
  if (!startMatches && clocks.length >= 1) {
    // Venue-hours pages often list many clocks; only conflict when none match start.
    return true;
  }
  return false;
}

export function evaluateScheduleTimeSanity(input: {
  startTimeMin: number;
  endTimeMin?: number | null;
  timeZone?: string | null;
  listingLat?: number | null;
  listingLng?: number | null;
  listingStoredTimeZone?: string | null;
  rawText?: string | null;
}): ScheduleTimeSanityVerdict {
  const reasons: ScheduleTimeSanityReason[] = [];
  const start = input.startTimeMin;
  if (!Number.isInteger(start) || start < 0 || start >= MINUTES_PER_DAY) {
    reasons.push("impossible_window");
  } else if (start >= SUSPICIOUS_MORNING_START_MIN && start < SUSPICIOUS_MORNING_END_EXCLUSIVE) {
    reasons.push("morning_start_unconfirmed");
  }

  if (input.endTimeMin != null) {
    const resolved =
      input.endTimeMin <= start && start < MINUTES_PER_DAY
        ? resolveScheduleEndMin(start, input.endTimeMin)
        : input.endTimeMin;
    const duration = resolved - start;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MINUTES_PER_DAY) {
      reasons.push("impossible_window");
    } else if (duration > MAX_PUBLIC_OPEN_MIC_DURATION_MIN) {
      reasons.push("duration_over_8h");
    }
  }

  const zone = input.timeZone?.trim() || input.listingStoredTimeZone?.trim() || "";
  const hasGeo = input.listingLat != null && input.listingLng != null;
  if (!isConfidentIanaTimeZone(zone) && !hasGeo) {
    reasons.push("timezone_unconfirmed");
  }

  if (
    input.rawText &&
    sourceTextConflictsParsedTime({
      startTimeMin: start,
      endTimeMin: input.endTimeMin ?? null,
      rawText: input.rawText,
    })
  ) {
    reasons.push("source_text_conflict");
  }

  return { ok: reasons.length === 0, reasons };
}

export function scheduleDescriptionIsTimeUnconfirmed(description: string | null | undefined): boolean {
  return Boolean(description?.startsWith(TIME_UNCONFIRMED_PREFIX));
}

export function markTimeUnconfirmedDescription(
  existing: string | null | undefined,
  reasons: ScheduleTimeSanityReason[],
): string {
  const rest = (existing ?? "").replace(new RegExp(`^${TIME_UNCONFIRMED_PREFIX}(?::[A-Z0-9_,]+)?\\s*`), "").trim();
  return `${TIME_UNCONFIRMED_PREFIX}:${reasons.join(",")}${rest ? ` ${rest}` : ""}`.slice(0, 1900);
}

/** Active schedule whose clock times may be shown publicly / used for JSON-LD. */
export function scheduleTimesArePubliclyConfirmed(schedule: {
  isActive?: boolean;
  description?: string | null;
}): boolean {
  if (schedule.isActive === false) return false;
  return !scheduleDescriptionIsTimeUnconfirmed(schedule.description);
}
