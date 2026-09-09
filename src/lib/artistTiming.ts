/**
 * Artist timing semantics for Host/Venue schedule editors.
 *
 * Storage stays `slotMinutes` (performance length) + `breakMinutes` (changeover gap).
 * Product UI exposes the clearer pair:
 *   - Performance time (minutes on stage)
 *   - New artist starts every (minutes between start times)
 *
 * Changeover = startEvery − performance. Never ask hosts to invent a "break" field.
 */
import { generateSlotsForWindow, type SlotSpec } from "@/lib/slotGeneration";

export type ArtistTiming = {
  /** Minutes each artist performs (maps to slotMinutes). */
  performanceMinutes: number;
  /** Minutes between consecutive artist START times. */
  artistStartEveryMinutes: number;
};

export type StoredSlotTiming = {
  slotMinutes: number;
  breakMinutes: number;
};

export const HOST_DEFAULT_PERFORMANCE_MINUTES = 15;
export const HOST_DEFAULT_START_EVERY_MINUTES = 20;
export const VENUE_DEFAULT_PERFORMANCE_MINUTES = 25;
export const VENUE_DEFAULT_START_EVERY_MINUTES = 30;

const PERF_MIN = 3;
const PERF_MAX = 60;
const START_EVERY_MAX = 120;

export function changeoverMinutes(timing: ArtistTiming): number {
  return timing.artistStartEveryMinutes - timing.performanceMinutes;
}

export function toStoredSlotTiming(timing: ArtistTiming): StoredSlotTiming {
  return {
    slotMinutes: timing.performanceMinutes,
    breakMinutes: changeoverMinutes(timing),
  };
}

export function fromStoredSlotTiming(stored: StoredSlotTiming): ArtistTiming {
  return {
    performanceMinutes: stored.slotMinutes,
    artistStartEveryMinutes: stored.slotMinutes + stored.breakMinutes,
  };
}

export type ArtistTimingParseResult =
  | { ok: true; timing: ArtistTiming; stored: StoredSlotTiming }
  | { ok: false; reason: "invalid_performance" | "invalid_start_every" | "start_every_too_short" };

export function parseArtistTiming(input: {
  performanceMinutes: number;
  artistStartEveryMinutes: number;
}): ArtistTimingParseResult {
  const performanceMinutes = Math.trunc(input.performanceMinutes);
  const artistStartEveryMinutes = Math.trunc(input.artistStartEveryMinutes);
  if (!Number.isFinite(performanceMinutes) || performanceMinutes < PERF_MIN || performanceMinutes > PERF_MAX) {
    return { ok: false, reason: "invalid_performance" };
  }
  if (
    !Number.isFinite(artistStartEveryMinutes) ||
    artistStartEveryMinutes < PERF_MIN ||
    artistStartEveryMinutes > START_EVERY_MAX
  ) {
    return { ok: false, reason: "invalid_start_every" };
  }
  // Overlapping performers are not a supported product mode.
  if (artistStartEveryMinutes < performanceMinutes) {
    return { ok: false, reason: "start_every_too_short" };
  }
  const timing = { performanceMinutes, artistStartEveryMinutes };
  return { ok: true, timing, stored: toStoredSlotTiming(timing) };
}

/**
 * Read Host/Venue form fields. Accepts the new names, or legacy slotMinutes/breakMinutes
 * so older clients keep working during deploy.
 */
export function parseArtistTimingFromForm(
  formData: FormData,
  defaults: { performanceMinutes: number; artistStartEveryMinutes: number },
): ArtistTimingParseResult {
  const perfRaw = formData.get("performanceMinutes")?.toString();
  const everyRaw = formData.get("artistStartEveryMinutes")?.toString();

  if (perfRaw != null && perfRaw !== "" && everyRaw != null && everyRaw !== "") {
    return parseArtistTiming({
      performanceMinutes: Number.parseInt(perfRaw, 10),
      artistStartEveryMinutes: Number.parseInt(everyRaw, 10),
    });
  }

  // Legacy: slot length + break gap.
  const slotRaw = formData.get("slotMinutes")?.toString();
  const breakRaw = formData.get("breakMinutes")?.toString();
  if (slotRaw != null && slotRaw !== "") {
    const slotMinutes = Number.parseInt(slotRaw, 10);
    const breakMinutes = breakRaw != null && breakRaw !== "" ? Number.parseInt(breakRaw, 10) : 0;
    if (!Number.isFinite(slotMinutes) || !Number.isFinite(breakMinutes) || breakMinutes < 0) {
      return { ok: false, reason: "invalid_performance" };
    }
    return parseArtistTiming({
      performanceMinutes: slotMinutes,
      artistStartEveryMinutes: slotMinutes + breakMinutes,
    });
  }

  return parseArtistTiming(defaults);
}

export function generateSlotsFromArtistTiming(input: {
  startTimeMin: number;
  endTimeMin: number;
  performanceMinutes: number;
  artistStartEveryMinutes: number;
}): SlotSpec[] {
  const parsed = parseArtistTiming({
    performanceMinutes: input.performanceMinutes,
    artistStartEveryMinutes: input.artistStartEveryMinutes,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return generateSlotsForWindow({
    startTimeMin: input.startTimeMin,
    endTimeMin: input.endTimeMin,
    slotMinutes: parsed.stored.slotMinutes,
    breakMinutes: parsed.stored.breakMinutes,
  });
}

/** Public header copy — start times matter; no "break row" language. */
export function artistTimingPublicLabel(stored: StoredSlotTiming): string {
  const t = fromStoredSlotTiming(stored);
  if (t.artistStartEveryMinutes === t.performanceMinutes) {
    return `${t.performanceMinutes} min performances`;
  }
  return `${t.performanceMinutes} min performances · artists start every ${t.artistStartEveryMinutes} min`;
}
