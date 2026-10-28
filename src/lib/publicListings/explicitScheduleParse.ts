import type { Weekday } from "@/generated/prisma/client";

const DAY_MAP: Record<string, Weekday> = {
  sunday: "SUN",
  sun: "SUN",
  su: "SUN",
  monday: "MON",
  mon: "MON",
  mo: "MON",
  tuesday: "TUE",
  tue: "TUE",
  tues: "TUE",
  tu: "TUE",
  wednesday: "WED",
  wed: "WED",
  we: "WED",
  thursday: "THU",
  thu: "THU",
  thur: "THU",
  thurs: "THU",
  th: "THU",
  friday: "FRI",
  fri: "FRI",
  fr: "FRI",
  saturday: "SAT",
  sat: "SAT",
  sa: "SAT",
};

const JS_DAY: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const OPEN_MIC_RE =
  /\b(open[\s-]?mics?|open[\s-]?mikes?|open[\s-]?stage|open[\s-]?jam|comedy\s+open\s+mic|poetry\s+open\s+mic)\b/i;

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
  } else if (hour >= 1 && hour <= 11 && !minRaw) {
    // "Tuesday 8" without am/pm is not explicit.
    return null;
  } else if (hour >= 1 && hour <= 11) {
    // "Tuesday 8:00" without am/pm is not explicit (could be morning).
    return null;
  }
  return hour * 60 + min;
}

function parseClockLoose(hourRaw: string, minRaw: string | undefined, ampmRaw: string | undefined): number | null {
  let hour = Number.parseInt(hourRaw, 10);
  const min = minRaw ? Number.parseInt(minRaw, 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(min) || min < 0 || min > 59) return null;
  const ap = ampmRaw?.replace(/\./g, "").toLowerCase();
  if (ap === "am" || ap === "pm") {
    if (hour < 1 || hour > 12) return null;
    if (ap === "am") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  } else if (hour < 12) {
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

const DAY_ALT = "sundays?|sun|mondays?|mon|tuesdays?|tues?|wednesdays?|wed|thursdays?|thurs?|thu|fridays?|fri|saturdays?|sat";

const SCHEDULE_DAY_THEN_TIME = new RegExp(
  `\\b(every\\s+|each\\s+)?(${DAY_ALT})\\b(?:\\s+(?:nights?|evenings?))?(?:\\s*[,:]|\\s+(?:at|from))?\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?(?:\\s*(?:-|to|–|until)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?)?`,
  "i",
);

const SCHEDULE_TIME_THEN_DAY = new RegExp(
  `\\b(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)\\s+(?:every|each|on)\\s+(${DAY_ALT})\\b`,
  "i",
);

const SIGNUP_RE =
  /\b(sign[\s-]?up(?:\s+(?:at the door|online|in person|with the host|at \w+))?|door list|put your name on the list|name on the list)\b/i;

function weekdayFromToken(raw: string | undefined): Weekday | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/s$/, "");
  return DAY_MAP[key] ?? DAY_MAP[raw.toLowerCase()] ?? null;
}

function hitFromDayTime(
  weekday: Weekday,
  startHour: string,
  startMin: string | undefined,
  startAp: string | undefined,
  endHour?: string,
  endMin?: string,
  endAp?: string,
  raw?: string,
  recurring?: boolean,
  hay?: string,
): ExplicitScheduleParse | null {
  const start = parseClockLoose(startHour, startMin, startAp?.replace(/\./g, ""));
  if (start == null) return null;
  let endTimeMin: number | null = null;
  if (endHour) {
    const end = parseClockLoose(endHour, endMin, (endAp ?? startAp)?.replace(/\./g, ""));
    if (end != null) endTimeMin = end <= start ? end + 1440 : end;
  }
  const signup = hay ? SIGNUP_RE.exec(hay)?.[0]?.trim() ?? null : null;
  return {
    weekday,
    startTimeMin: start,
    endTimeMin,
    signupMethod: signup,
    recurring: Boolean(recurring || (hay && /\b(weekly|every|each week|recurring)\b/i.test(hay))),
    raw: (raw ?? "").trim(),
  };
}

/**
 * Extract a schedule only when weekday and start time are explicit in the text.
 * Does not invent an end time.
 */
export function parseExplicitScheduleFromText(text: string): ExplicitScheduleParse | null {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;

  const dayFirst = SCHEDULE_DAY_THEN_TIME.exec(collapsed);
  if (dayFirst) {
    const weekday = weekdayFromToken(dayFirst[2]);
    if (weekday && dayFirst[3]) {
      const hit = hitFromDayTime(
        weekday,
        dayFirst[3],
        dayFirst[4],
        dayFirst[5],
        dayFirst[6],
        dayFirst[7],
        dayFirst[8],
        dayFirst[0],
        Boolean(dayFirst[1]),
        collapsed,
      );
      if (hit) return hit;
    }
  }

  const timeFirst = SCHEDULE_TIME_THEN_DAY.exec(collapsed);
  if (timeFirst) {
    const weekday = weekdayFromToken(timeFirst[4]);
    if (weekday) {
      const hit = hitFromDayTime(
        weekday,
        timeFirst[1],
        timeFirst[2],
        timeFirst[3],
        undefined,
        undefined,
        undefined,
        timeFirst[0],
        true,
        collapsed,
      );
      if (hit) return hit;
    }
  }

  return null;
}

function flattenLd(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => flattenLd(n));
  const rec = node as Record<string, unknown>;
  const out = [rec];
  if (rec["@graph"]) out.push(...flattenLd(rec["@graph"]));
  if (Array.isArray(rec.itemListElement)) out.push(...flattenLd(rec.itemListElement));
  return out;
}

function asTypes(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function byDayFromLd(value: unknown): Weekday | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw ?? "")
    .replace(/^https?:\/\/schema\.org\//i, "")
    .trim();
  return weekdayFromToken(s);
}

/** Wall-clock minutes from an ISO local datetime. Never Date.parse/getHours (UTC host skew). */
function wallClockFromIsoDateTime(s: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const hour = Number.parseInt(m[2]!, 10);
  const min = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(min) || hour > 23 || min > 59) return null;
  // Date-only / all-day midnight is not an explicit show time.
  if (hour === 0 && min === 0) return null;
  return hour * 60 + min;
}

function weekdayFromIsoDatePrefix(s: string): Weekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10);
  const d = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const day = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).getUTCDay();
  return JS_DAY[day] ?? null;
}

function clockFromIsoOrClock(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  const iso = wallClockFromIsoDateTime(s);
  if (iso != null) return iso;
  if (/^\d{4}-\d{2}-\d{2}T00:00/.test(s)) return null;
  const clock = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s);
  if (clock) {
    const hour = Number.parseInt(clock[1]!, 10);
    const min = Number.parseInt(clock[2]!, 10);
    if (hour > 23) return null;
    return hour * 60 + min;
  }
  return null;
}

function parseLdEventNode(node: Record<string, unknown>): ExplicitScheduleParse | null {
  const types = asTypes(node);
  const isEvent = types.some((t) => /Event|EventSeries|Schedule/i.test(t));
  const name = String(node.name ?? node.headline ?? "");
  const desc = String(node.description ?? "");
  const hay = `${name} ${desc}`;
  const schedule = (node.eventSchedule ?? node) as Record<string, unknown>;
  const byDay = byDayFromLd(schedule.byDay ?? node.byDay);
  const startTime = schedule.startTime ?? node.startTime;
  const openMic = OPEN_MIC_RE.test(hay);
  if (!openMic && !isEvent) return null;
  if (!openMic && isEvent && !OPEN_MIC_RE.test(JSON.stringify(node).slice(0, 2000))) return null;

  if (byDay && startTime) {
    const start = clockFromIsoOrClock(startTime);
    if (start == null) return null;
    const end = clockFromIsoOrClock(schedule.endTime ?? node.endTime);
    return {
      weekday: byDay,
      startTimeMin: start,
      endTimeMin: end,
      signupMethod: SIGNUP_RE.exec(hay)?.[0]?.trim() ?? null,
      recurring: true,
      raw: `${byDay} ${String(startTime)}`,
    };
  }

  const startDate = node.startDate ?? schedule.startDate;
  if (startDate && /\b(every|weekly|each)\b/i.test(hay) && openMic) {
    const weekday = weekdayFromIsoDatePrefix(String(startDate));
    const start = clockFromIsoOrClock(startDate);
    if (weekday && start != null) {
      return {
        weekday,
        startTimeMin: start,
        endTimeMin: clockFromIsoOrClock(node.endDate ?? node.endTime),
        signupMethod: SIGNUP_RE.exec(hay)?.[0]?.trim() ?? null,
        recurring: true,
        raw: String(startDate),
      };
    }
  }
  return null;
}

export function parseExplicitScheduleFromJsonLd(html: string): ExplicitScheduleParse | null {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    try {
      const json = JSON.parse((m[1] ?? "").trim()) as unknown;
      for (const node of flattenLd(json)) {
        const hit = parseLdEventNode(node);
        if (hit) return hit;
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return null;
}

export function parseExplicitScheduleFromIcs(ics: string): ExplicitScheduleParse | null {
  const blocks = ics.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const summary = /SUMMARY(?:;[^:]*)?:([^\r\n]+)/i.exec(block)?.[1] ?? "";
    const description = /DESCRIPTION(?:;[^:]*)?:([^\r\n]+)/i.exec(block)?.[1] ?? "";
    const hay = `${summary} ${description}`.replace(/\\n/g, " ");
    if (!OPEN_MIC_RE.test(hay)) continue;
    const rrule = /RRULE:([^\r\n]+)/i.exec(block)?.[1] ?? "";
    if (!/FREQ=WEEKLY/i.test(rrule)) continue;
    const byDay = /BYDAY=([A-Z]{2}(?:,[A-Z]{2})*)/i.exec(rrule)?.[1]?.split(",")[0];
    const weekday = byDay ? weekdayFromToken(byDay.toLowerCase()) : null;
    const dtstart = /DTSTART(?:;[^:]*)?:(\d{8}T\d{6})/i.exec(block)?.[1];
    if (!weekday || !dtstart) continue;
    const hour = Number.parseInt(dtstart.slice(9, 11), 10);
    const min = Number.parseInt(dtstart.slice(11, 13), 10);
    if (!Number.isFinite(hour) || !Number.isFinite(min)) continue;
    return {
      weekday,
      startTimeMin: hour * 60 + min,
      endTimeMin: null,
      signupMethod: SIGNUP_RE.exec(hay)?.[0]?.trim() ?? null,
      recurring: true,
      raw: `RRULE:${rrule} DTSTART:${dtstart}`,
    };
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(td|th|tr|li|p|div|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseExplicitScheduleFromTable(html: string): ExplicitScheduleParse | null {
  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const row of rows) {
    const text = stripTags(row[1] ?? "");
    if (!OPEN_MIC_RE.test(text) && !/\b(open\s+mic|weekly)\b/i.test(text)) continue;
    const hit = parseExplicitScheduleFromText(text);
    if (hit) return hit;
  }
  return null;
}

export function extractOfficialIcsUrls(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const hrefs = html.matchAll(/href=["']([^"']+\.ics[^"']*)["']/gi);
  let base: URL | null = null;
  try {
    base = new URL(pageUrl);
  } catch {
    base = null;
  }
  for (const m of hrefs) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    try {
      const abs = base ? new URL(raw, base).toString() : raw;
      if (/^https?:\/\//i.test(abs)) out.push(abs);
    } catch {
      /* skip */
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/**
 * Parse schedule from official HTML: JSON-LD Event / schema.org, tables, ICS mention, then visible text.
 * Never infers a weekday or start time that is not written in the source.
 */
export function parseExplicitScheduleFromHtml(html: string): ExplicitScheduleParse | null {
  return (
    parseExplicitScheduleFromJsonLd(html) ||
    parseExplicitScheduleFromTable(html) ||
    parseExplicitScheduleFromText(stripTags(html))
  );
}

/** Kept for callers that already have plain text. */
export { parseClock };
