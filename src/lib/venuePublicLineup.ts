import { DateTime } from "luxon";
import { slotStartInstant } from "@/lib/venueBookingRules";
import type { LineupInstance, LineupTemplate } from "@/lib/venuePublicLineupData";

export function storageYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) in the venue’s timezone, for “today / tonight”. */
export function venueCalendarIsoDate(venueTz: string, now: Date): string {
  const z = venueTz?.trim() || "America/Chicago";
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(z);
  return dt.isValid ? dt.toISODate()! : storageYmdUtc(now);
}

export function instanceWindow(
  instance: Pick<LineupInstance, "date" | "slots">,
  timeZone: string,
): { start: Date; end: Date } | null {
  const slots = instance.slots ?? [];
  if (slots.length === 0) return null;
  const minS = Math.min(...slots.map((s) => s.startMin));
  const maxE = Math.max(...slots.map((s) => s.endMin));
  return {
    start: slotStartInstant(instance.date, minS, timeZone),
    end: slotStartInstant(instance.date, maxE, timeZone),
  };
}

export type LineupBadge = "live" | "tonight" | "upcoming";

export type PrimaryLineupPick = {
  template: LineupTemplate;
  instance: LineupInstance;
  badge: LineupBadge;
};

/**
 * Choose the “hero” lineup: in-progress window first, else the next show that hasn’t ended (by slot end time).
 */
export function pickPrimaryLineup(
  templates: LineupTemplate[],
  venueTz: string,
  now: Date,
): PrimaryLineupPick | null {
  const todayYmd = venueCalendarIsoDate(venueTz, now);
  type Cand = { t: LineupTemplate; i: LineupInstance; w: { start: Date; end: Date } };
  const candidates: Cand[] = [];
  for (const t of templates) {
    for (const i of t.instances) {
      if (i.isCancelled) continue;
      const w = instanceWindow(i, t.timeZone);
      if (!w) continue;
      candidates.push({ t, i, w });
    }
  }
  candidates.sort((a, b) => a.w.start.getTime() - b.w.start.getTime());

  for (const c of candidates) {
    if (now.getTime() >= c.w.start.getTime() && now.getTime() < c.w.end.getTime()) {
      return { template: c.t, instance: c.i, badge: "live" };
    }
  }
  for (const c of candidates) {
    if (c.w.end.getTime() > now.getTime()) {
      const iy = storageYmdUtc(c.i.date);
      const badge: LineupBadge =
        iy === todayYmd && now.getTime() < c.w.start.getTime() ? "tonight" : "upcoming";
      return { template: c.t, instance: c.i, badge };
    }
  }
  return null;
}

export type LineupForDateRow = { template: LineupTemplate; instance: LineupInstance };

/** All public lineups on a given calendar day (venue may run multiple blocks). */
export function lineupsForStorageYmd(templates: LineupTemplate[], ymd: string): LineupForDateRow[] {
  const out: LineupForDateRow[] = [];
  for (const t of templates) {
    for (const i of t.instances) {
      if (i.isCancelled) continue;
      if (!i.slots?.length) continue;
      if (storageYmdUtc(i.date) !== ymd) continue;
      out.push({ template: t, instance: i });
    }
  }
  out.sort((a, b) => a.template.startTimeMin - b.template.startTimeMin);
  return out;
}

/** Distinct future (or in-progress) lineup dates for navigation chips. */
export function upcomingLineupDateYmds(
  templates: LineupTemplate[],
  venueTz: string,
  now: Date,
  maxDates: number,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  type Cand = { ymd: string; end: Date };
  const cands: Cand[] = [];
  for (const t of templates) {
    for (const i of t.instances) {
      if (i.isCancelled) continue;
      const w = instanceWindow(i, t.timeZone);
      if (!w) continue;
      if (w.end.getTime() <= now.getTime()) continue;
      cands.push({ ymd: storageYmdUtc(i.date), end: w.end });
    }
  }
  cands.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.end.getTime() - b.end.getTime());
  for (const c of cands) {
    if (seen.has(c.ymd)) continue;
    seen.add(c.ymd);
    ordered.push(c.ymd);
    if (ordered.length >= maxDates) break;
  }
  return ordered;
}

export function isValidLineupYmd(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}
