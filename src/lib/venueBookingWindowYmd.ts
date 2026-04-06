/**
 * Pure in-process booking-window date math for venue portal actions.
 * Uses `Intl` for "today" in an IANA zone and UTC calendar arithmetic for YMD offsets
 * (avoids Luxon in hot paths where some production runtimes have regressed or stalled).
 */

/** Returns false if `tz` is not accepted by the runtime ICU database (throws on ctor). */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export function venueTodayYmdFromIanaZone(ianaZone: string, now: Date): string {
  const z = ianaZone?.trim() || "America/Chicago";
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: z,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = f.formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const mo = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && mo && d) {
      return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  } catch (e) {
    console.error("[venueBookingWindowYmd] Intl failed for zone", z, e);
  }
  return now.toISOString().slice(0, 10);
}

/** Add whole calendar days to a YYYY-MM-DD string (UTC date rolling). */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const y = Number.parseInt(ymd.slice(0, 4), 10);
  const m = Number.parseInt(ymd.slice(5, 7), 10);
  const d = Number.parseInt(ymd.slice(8, 10), 10);
  const u = Date.UTC(y, m - 1, d + deltaDays);
  return new Date(u).toISOString().slice(0, 10);
}

/** Difference in whole days from `fromYmd` to `toYmd` (same instant math as prior Luxon diff). */
export function wholeDaysBetweenYmd(fromYmd: string, toYmd: string): number {
  const ta = Date.UTC(
    Number.parseInt(fromYmd.slice(0, 4), 10),
    Number.parseInt(fromYmd.slice(5, 7), 10) - 1,
    Number.parseInt(fromYmd.slice(8, 10), 10),
  );
  const tb = Date.UTC(
    Number.parseInt(toYmd.slice(0, 4), 10),
    Number.parseInt(toYmd.slice(5, 7), 10) - 1,
    Number.parseInt(toYmd.slice(8, 10), 10),
  );
  return Math.round((tb - ta) / 86400000);
}
