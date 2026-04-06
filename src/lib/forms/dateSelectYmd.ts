/** Calendar helpers for YYYY-MM-DD dropdown fields (no external deps). */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) return isLeapYear(year) ? 29 : 28;
  const dim = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim[month1to12 - 1]!;
}

export function parseYmdStrict(raw: string): { y: number; m: number; d: number } | null {
  const s = raw?.trim() ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function formatYmdParts(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Clamp day to valid calendar day for the given month/year. */
export function clampDayToMonth(year: number, month1to12: number, day: number): number {
  const max = daysInMonth(year, month1to12);
  return Math.min(Math.max(1, day), max);
}
