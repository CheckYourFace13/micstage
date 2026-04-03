import { Weekday } from "@/generated/prisma/client";

export function weekdayToLabel(d: Weekday): string {
  switch (d) {
    case "MON":
      return "Monday";
    case "TUE":
      return "Tuesday";
    case "WED":
      return "Wednesday";
    case "THU":
      return "Thursday";
    case "FRI":
      return "Friday";
    case "SAT":
      return "Saturday";
    case "SUN":
      return "Sunday";
  }
}

export function minutesToTimeLabel(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

export function toIsoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `HH:MM` (24h) for `<input type="time" />`. */
export function minutesToTimeInputValue(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

export function timeInputValueToMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Label for lineup date chips (storage YYYY-MM-DD, UTC calendar day). */
export function lineupNavLabelFromYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

