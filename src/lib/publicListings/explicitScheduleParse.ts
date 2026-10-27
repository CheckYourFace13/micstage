import type { Weekday } from "@/generated/prisma/client";

const DAY_MAP: Record<string, Weekday> = {
  sunday: "SUN",
  sun: "SUN",
  monday: "MON",
  mon: "MON",
  tuesday: "TUE",
  tue: "TUE",
  tues: "TUE",
  wednesday: "WED",
  wed: "WED",
  thursday: "THU",
  thu: "THU",
  thur: "THU",
  thurs: "THU",
  friday: "FRI",
  fri: "FRI",
  saturday: "SAT",
  sat: "SAT",
};

function parseClock(hourRaw: string, minRaw: string | undefined, ampmRaw: string | undefined): number | null {
  let hour = Number.parseInt(hourRaw, 10);
  const min = minRaw ? Number.parseInt(minRaw, 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(min) || min < 0 || min > 59) return null;
  const ap = ampmRaw?.toLowerCase();
  if (ap === "am" || ap === "pm") {
    if (hour < 1 || hour > 12) return null;
    if (ap === "am") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + min;
}

export type ExplicitScheduleParse = {
  weekday: Weekday;
  startTimeMin: number;
  endTimeMin: number | null;
  signupMethod: string | null;
  recurring: boolean;
  raw: string;
};

const SCHEDULE_RE =
  /\b(every\s+|each\s+)?(sundays?|sun|mondays?|mon|tuesdays?|tues?|wednesdays?|wed|thursdays?|thurs?|thu|fridays?|fri|saturdays?|sat)\b(?:\s+(?:nights?|evenings?))?(?:\s+(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?(?:\s*(?:-|to|–|until)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?/i;

const SIGNUP_RE =
  /\b(sign[\s-]?up(?:\s+(?:at the door|online|in person|with the host|at \w+))?|door list|put your name on the list|name on the list)\b/i;

/**
 * Extract a schedule only when weekday and start time are explicit in the text.
 * Does not invent an end time.
 */
export function parseExplicitScheduleFromText(text: string): ExplicitScheduleParse | null {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const m = SCHEDULE_RE.exec(collapsed);
  if (!m) return null;
  const dayKey = (m[2] ?? "").toLowerCase().replace(/s$/, "");
  const weekday = DAY_MAP[dayKey] ?? DAY_MAP[(m[2] ?? "").toLowerCase()];
  if (!weekday) return null;
  if (!m[3]) return null;
  const startAmpm = m[5]?.replace(/\./g, "") ?? undefined;
  const start = parseClock(m[3], m[4], startAmpm);
  if (start == null) return null;
  let endTimeMin: number | null = null;
  if (m[6]) {
    const endAmpm = m[8]?.replace(/\./g, "") ?? startAmpm;
    const end = parseClock(m[6], m[7], endAmpm);
    if (end != null) endTimeMin = end <= start ? end + 1440 : end;
  }
  const signup = SIGNUP_RE.exec(collapsed)?.[0]?.trim() ?? null;
  return {
    weekday,
    startTimeMin: start,
    endTimeMin,
    signupMethod: signup,
    recurring: Boolean(m[1] || /\b(weekly|every|each week|recurring)\b/i.test(collapsed)),
    raw: m[0].trim(),
  };
}
