"use server";

import {
  buildVenuePortalRedirect,
  portalRedirect,
  type VenuePortalActionResult,
  VenuePortalRedirectSignal,
} from "@/lib/venuePortalActionResult";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requirePrisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession, venueIdsForVenueSession } from "@/lib/authz";
import { generateSlotsForWindow } from "@/lib/slotGeneration";
import { syncSlotsForInstance } from "@/lib/slotSync";
import {
  iterStorageDatesInVenueSeries,
  parseWeekdaysFromForm,
  weekdayFromIsoDateInTimeZone,
} from "@/lib/weeklySchedule";
import {
  bookingBlockReason,
  isDateInSeriesRange,
  isWithinBookingWindow,
  slotStartInstant,
} from "@/lib/venueBookingRules";
import { isValidLineupYmd, storageYmdUtc } from "@/lib/venuePublicLineup";
import {
  addDaysToYmd,
  isValidIanaTimeZone,
  venueTodayYmdFromIanaZone,
  wholeDaysBetweenYmd,
} from "@/lib/venueBookingWindowYmd";
import { BookingRestrictionMode, VenuePerformerHistoryKind, Weekday } from "@/generated/prisma/client";
import { BOOKING_RESTRICTION_OPTIONS } from "@/lib/bookingRestrictionUi";
import { isLineupRuleTier, prismaOverridesForLineupRuleTierSelection } from "@/lib/lineupRuleTiers";
import { timeInputValueToMinutes } from "@/lib/time";
import { parseVenuePerformanceFormat } from "@/lib/venuePerformanceFormat";
import {
  touchVenuePerformerHistoryForManual,
  touchVenuePerformerHistoryForMusician,
} from "@/lib/venuePerformerHistory";
import {
  isVenueLineupTestCleanupUiEnabled,
  runVenueLineupTestCleanup,
} from "@/lib/venueTestLineupCleanup";
import { storeProfileImage } from "@/lib/profileAssetStorage";
import { getSession } from "@/lib/session";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

/** Missing/tampered fields → friendly portal message instead of generic error UI. */
function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim())
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));
  return v.trim();
}

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function reqInt(formData: FormData, key: string): number {
  const v = reqString(formData, key);
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));
  return n;
}

function optInt(formData: FormData, key: string): number | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function reqDate(formData: FormData, key: string): Date {
  const iso = reqString(formData, key); // YYYY-MM-DD
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));
  return d;
}

function optDate(formData: FormData, key: string): Date | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function checkboxOn(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function normalizeUrl(v?: string): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const ALLOWED_BOOKING_MODES = new Set<string>(BOOKING_RESTRICTION_OPTIONS.map((o) => o.value));

async function advanceVenueGrowthListingLive(venueId: string): Promise<void> {
  const prisma = requirePrisma();
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { owner: { select: { email: true } } },
  });
  const ownerEmail = normalizeMarketingEmail(venue?.owner?.email ?? "");
  if (!ownerEmail) return;
  const lead = await prisma.growthLead.findFirst({
    where: { leadType: "VENUE", contactEmailNormalized: ownerEmail },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!lead) return;
  await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "LISTING_LIVE", { leadType: "VENUE" });
}

/**
 * Schedule form dates are stored as `YYYY-MM-DDT00:00:00.000Z` (civil date keys).
 * Comparing them to "today" using UTC midnight wrongly rejects same-calendar-day picks for
 * venues behind UTC (evening local while UTC is already the next day).
 */
type VenueScheduleBoundsOk = {
  ok: true;
  /** Stored window start/end YMD (raw from this save before clamping). */
  storedBookingWindowStartYmd: string;
  storedBookingWindowEndYmd: string;
  /** Window used for validation, DB persist, and generation (start clamped up to venue today when needed). */
  effectiveBookingWindowStartYmd: string;
  effectiveBookingWindowEndYmd: string;
  storedBookingWindowStartClampedToVenueToday: boolean;
};

type VenueScheduleBoundsFail = { ok: false; redirect: VenuePortalActionResult };

type VenueScheduleBoundsResult = VenueScheduleBoundsOk | VenueScheduleBoundsFail;

function assertVenueYmdRangeWithinHorizon(opts: {
  venueTz: string;
  now: Date;
  maxHorizonDays: number;
  /** Inclusive YYYY-MM-DD range for this save (series or one-event). */
  seriesStartYmd: string;
  seriesEndYmd: string;
  /** Widened venue window written to DB (may span beyond this save for one_event). */
  storedWindowStartYmd: string;
  storedWindowEndYmd: string;
}): VenueScheduleBoundsResult {
  let diagStep = "enter";
  let effectiveTzForDiag = "America/Chicago";
  try {
    console.info("[venue weekly submit] bounds step: venue today + horizon end");

    diagStep = "pre_read_raw_venueTz";
    console.info("[venue weekly submit] bounds isolation: before reading opts.venueTz");
    const rawVenueTz = opts.venueTz;
    diagStep = "post_read_raw_venueTz";
    console.info("[venue weekly submit] bounds isolation: rawVenueTz value", { rawVenueTz });

    diagStep = "pre_trim_venueTz";
    const trimmedVenueTz = typeof rawVenueTz === "string" ? rawVenueTz.trim() : "";
    diagStep = "post_trim_venueTz";
    console.info("[venue weekly submit] bounds isolation: trimmedVenueTz", { trimmedVenueTz });

    diagStep = "pre_blank_fallback";
    let effectiveTz = trimmedVenueTz;
    let usedBlankTimezoneFallback = false;
    if (!effectiveTz) {
      usedBlankTimezoneFallback = true;
      effectiveTz = "America/Chicago";
      console.info("[venue weekly submit] bounds isolation: missing/blank timezone fallback", {
        effectiveTz,
        usedBlankTimezoneFallback,
      });
    } else {
      console.info("[venue weekly submit] bounds isolation: no blank timezone fallback", {
        trimmedVenueTz,
      });
    }

    diagStep = "pre_isValidIanaTimeZone";
    console.info("[venue weekly submit] bounds isolation: before isValidIanaTimeZone", { candidateTz: effectiveTz });
    const tzIanaOk = isValidIanaTimeZone(effectiveTz);
    diagStep = "post_isValidIanaTimeZone";
    console.info("[venue weekly submit] bounds isolation: after isValidIanaTimeZone", { tzIanaOk, candidateTz: effectiveTz });

    /** TEMPORARY isolation: if ICU rejects the venue zone, derive YMD from a fixed zone only (remove after root cause confirmed). */
    const debugTz = "America/Chicago";
    if (!tzIanaOk) {
      console.info("[venue weekly submit] invalid timezone fallback", { rejectedTz: effectiveTz, debugTz });
      effectiveTz = debugTz;
    }
    effectiveTzForDiag = effectiveTz;
    console.info("[venue weekly submit] bounds isolation: effectiveTz final", {
      effectiveTz,
      usedBlankTimezoneFallback,
    });

    diagStep = "pre_Intl_DateTimeFormat_ctor";
    console.info("[venue weekly submit] bounds isolation: before new Intl.DateTimeFormat(en-CA)", { effectiveTz });
    const boundsDtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: effectiveTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    diagStep = "post_Intl_DateTimeFormat_ctor";
    console.info("[venue weekly submit] bounds isolation: after new Intl.DateTimeFormat(en-CA)");

    diagStep = "pre_formatToParts";
    console.info("[venue weekly submit] bounds isolation: before formatToParts(now)");
    const boundsParts = boundsDtf.formatToParts(opts.now);
    diagStep = "post_formatToParts";
    console.info("[venue weekly submit] bounds isolation: after formatToParts(now)", { partCount: boundsParts.length });

    diagStep = "pre_find_year_part";
    const yPart = boundsParts.find((p) => p.type === "year")?.value;
    diagStep = "post_find_year_part";
    console.info("[venue weekly submit] bounds isolation: year part", { yPart });

    diagStep = "pre_find_month_part";
    const moPart = boundsParts.find((p) => p.type === "month")?.value;
    diagStep = "post_find_month_part";
    console.info("[venue weekly submit] bounds isolation: month part", { moPart });

    diagStep = "pre_find_day_part";
    const dPart = boundsParts.find((p) => p.type === "day")?.value;
    diagStep = "post_find_day_part";
    console.info("[venue weekly submit] bounds isolation: day part", { dPart });

    diagStep = "pre_assemble_venueTodayYmd";
    let venueTodayYmd: string;
    if (yPart && moPart && dPart) {
      venueTodayYmd = `${yPart.padStart(4, "0")}-${moPart.padStart(2, "0")}-${dPart.padStart(2, "0")}`;
    } else {
      venueTodayYmd = opts.now.toISOString().slice(0, 10);
      console.warn("[venue weekly submit] bounds isolation: venueTodayYmd fallback (UTC ISO slice)", {
        venueTodayYmd,
      });
    }
    diagStep = "post_assemble_venueTodayYmd";
    console.info("[venue weekly submit] bounds step: computed venueTodayYmd", { venueTodayYmd });

    diagStep = "pre_addDaysToYmd_horizon";
    console.info("[venue weekly submit] bounds isolation: before addDaysToYmd", {
      venueTodayYmd,
      maxHorizonDays: opts.maxHorizonDays,
    });
    const horizonEndYmd = addDaysToYmd(venueTodayYmd, opts.maxHorizonDays);
    diagStep = "post_addDaysToYmd_horizon";
    console.info("[venue weekly submit] bounds step: computed horizonEndYmd", {
      horizonEndYmd,
      maxHorizonDays: opts.maxHorizonDays,
    });
    if (!isValidLineupYmd(horizonEndYmd)) {
      console.error("[venue weekly submit] bounds fail: invalid horizon end ymd", {
        venueTodayYmd,
        horizonEndYmd,
        effectiveTz,
      });
      return { ok: false, redirect: portalRedirect("/venue?scheduleError=badRange") };
    }
    const horizonMaxYmd = horizonEndYmd;

    console.info("[venue weekly submit] bounds step: final booking window ymds (stored)", {
      bookingWindowStartYmd: opts.storedWindowStartYmd,
      bookingWindowEndYmd: opts.storedWindowEndYmd,
    });
    console.info("[venue weekly submit] bounds step: compare series ymds", {
      venueTodayYmd,
      horizonMaxYmd,
      seriesStartYmd: opts.seriesStartYmd,
      seriesEndYmd: opts.seriesEndYmd,
    });

    function checkSeriesPair(label: string, a: string, b: string): VenuePortalActionResult | null {
      if (!isValidLineupYmd(a) || !isValidLineupYmd(b)) {
        console.error("[venue weekly submit] bounds fail: invalid ymd", { label, a, b });
        console.info("[venue weekly submit] bounds step: validation branch", { branch: "invalid_ymd", label });
        return portalRedirect("/venue?scheduleError=badRange");
      }
      if (a < venueTodayYmd || b < venueTodayYmd) {
        console.info("[venue weekly submit] bounds step: validation branch", {
          branch: "before_venue_today",
          label,
          a,
          b,
          venueTodayYmd,
        });
        return portalRedirect("/venue?scheduleError=badRange");
      }
      if (a > horizonMaxYmd || b > horizonMaxYmd) {
        console.info("[venue weekly submit] bounds step: validation branch", {
          branch: "past_horizon",
          label,
          a,
          b,
          horizonMaxYmd,
          maxHorizonDays: opts.maxHorizonDays,
        });
        return portalRedirect("/venue?scheduleError=badRange");
      }
      return null;
    }

    const seriesFail = checkSeriesPair("series", opts.seriesStartYmd, opts.seriesEndYmd);
    if (seriesFail) return { ok: false, redirect: seriesFail };

    const sws = opts.storedWindowStartYmd;
    const swe = opts.storedWindowEndYmd;
    if (!isValidLineupYmd(sws) || !isValidLineupYmd(swe)) {
      console.error("[venue weekly submit] bounds fail: invalid stored window ymd", { sws, swe });
      console.info("[venue weekly submit] bounds step: validation branch", { branch: "invalid_ymd", label: "storedWindow" });
      return { ok: false, redirect: portalRedirect("/venue?scheduleError=badRange") };
    }

    const effectiveBookingWindowStartYmd = sws < venueTodayYmd ? venueTodayYmd : sws;
    const effectiveBookingWindowEndYmd = swe;
    const storedBookingWindowStartClampedToVenueToday = effectiveBookingWindowStartYmd !== sws;

    console.info("[venue weekly submit] bounds step: stored vs effective booking window start", {
      storedBookingWindowStartYmd: sws,
      effectiveBookingWindowStartYmd,
      storedBookingWindowStartClampedToVenueToday,
      venueTodayYmd,
      storedBookingWindowEndYmd: swe,
      effectiveBookingWindowEndYmd,
    });

    if (effectiveBookingWindowStartYmd > effectiveBookingWindowEndYmd) {
      console.info("[venue weekly submit] bounds step: validation branch", {
        branch: "effective_window_inverted",
        effectiveBookingWindowStartYmd,
        effectiveBookingWindowEndYmd,
        venueTodayYmd,
      });
      return { ok: false, redirect: portalRedirect("/venue?scheduleError=badRange") };
    }

    if (effectiveBookingWindowEndYmd < venueTodayYmd) {
      console.info("[venue weekly submit] bounds step: validation branch", {
        branch: "stored_window_end_before_venue_today",
        effectiveBookingWindowEndYmd,
        venueTodayYmd,
      });
      return { ok: false, redirect: portalRedirect("/venue?scheduleError=badRange") };
    }

    if (effectiveBookingWindowStartYmd > horizonMaxYmd || effectiveBookingWindowEndYmd > horizonMaxYmd) {
      console.info("[venue weekly submit] bounds step: validation branch", {
        branch: "past_horizon",
        label: "storedWindow_effective",
        effectiveBookingWindowStartYmd,
        effectiveBookingWindowEndYmd,
        horizonMaxYmd,
        maxHorizonDays: opts.maxHorizonDays,
      });
      return { ok: false, redirect: portalRedirect("/venue?scheduleError=badRange") };
    }

    console.info("[venue weekly submit] bounds step: validation branch", {
      branch: "within_horizon",
      venueTodayYmd,
      horizonEndYmd: horizonMaxYmd,
      storedBookingWindowStartYmd: sws,
      effectiveBookingWindowStartYmd,
      storedBookingWindowEndYmd: swe,
      effectiveBookingWindowEndYmd,
      storedBookingWindowStartClampedToVenueToday,
    });
    console.info("[venue weekly submit] bounds step: all pairs ok");
    return {
      ok: true,
      storedBookingWindowStartYmd: sws,
      storedBookingWindowEndYmd: swe,
      effectiveBookingWindowStartYmd,
      effectiveBookingWindowEndYmd,
      storedBookingWindowStartClampedToVenueToday,
    };
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[venue weekly submit] assertVenueYmdRangeWithinHorizon threw", {
      failedStep: diagStep,
      rawVenueTimezone: opts.venueTz,
      effectiveTimezoneUsed: effectiveTzForDiag,
      error: e,
      stack,
    });
    return { ok: false, redirect: portalRedirect("/venue?scheduleError=boundsCalc") };
  }
}

function normalizeOpenMicDescription(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const max = 900;
  return t.length > max ? t.slice(0, max) : t;
}

/** Start/end times on schedule forms; redirects instead of throwing into the error overlay. */
function scheduleTimeMinutesFromForm(formData: FormData, field: string): number {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw.trim())
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));
  const t = raw.trim();
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59)
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));
  return hh * 60 + mm;
}

export async function createEventTemplate(formData: FormData): Promise<VenuePortalActionResult> {
  const session = await requireVenueSession();
  try {
  const venueId = reqString(formData, "venueId");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const title = reqString(formData, "title");
  const weekday = reqString(formData, "weekday") as Weekday;
  const startTimeMin = scheduleTimeMinutesFromForm(formData, "startTime");
  const endTimeMin = scheduleTimeMinutesFromForm(formData, "endTime");
  if (endTimeMin <= startTimeMin) return portalRedirect("/venue?scheduleError=invalidTime");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");
  const seriesStartDate = reqDate(formData, "seriesStartDate");
  const seriesEndDate = reqDate(formData, "seriesEndDate");
  if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
    return portalRedirect("/venue?scheduleError=badRange");
  }

  const venue = await requirePrisma().venue.findUnique({
    where: { id: venueId },
    select: {
      timeZone: true,
      bookingRestrictionMode: true,
      restrictionHoursBefore: true,
      onPremiseMaxDistanceMeters: true,
      subscriptionTier: true,
      performanceFormat: true,
    },
  });
  const timeZone = venue?.timeZone ?? "America/Chicago";
  const description = normalizeOpenMicDescription(optString(formData, "description"));
  const maxHorizonDays = venue?.subscriptionTier === "FREE" ? 60 : 90;

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizonEndUtc = new Date(todayUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

  if (seriesStartDate.getTime() < todayUtc.getTime() || seriesStartDate.getTime() > horizonEndUtc.getTime()) {
    return portalRedirect("/venue?scheduleError=badRange");
  }
  if (seriesEndDate.getTime() < todayUtc.getTime() || seriesEndDate.getTime() > horizonEndUtc.getTime()) {
    return portalRedirect("/venue?scheduleError=badRange");
  }

  const bookingOpensDaysAhead = Math.max(
    1,
    Math.min(maxHorizonDays, Math.round((seriesEndDate.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))),
  );

  const bookingRestrictionModeStr = optString(formData, "bookingRestrictionMode") ?? venue?.bookingRestrictionMode ?? "NONE";
  if (!ALLOWED_BOOKING_MODES.has(bookingRestrictionModeStr)) return portalRedirect("/venue?profileError=format");
  const bookingRestrictionMode = bookingRestrictionModeStr as BookingRestrictionMode;

  const restrictionHoursBefore = optInt(formData, "restrictionHoursBefore") ?? venue?.restrictionHoursBefore ?? 6;
  const onPremiseMaxDistanceMeters = optInt(formData, "onPremiseMaxDistanceMeters") ?? venue?.onPremiseMaxDistanceMeters ?? 1000;

  const performanceFormat = parseVenuePerformanceFormat(
    optString(formData, "performanceFormat"),
    venue?.performanceFormat ?? "OPEN_VARIETY",
  );

  const prisma = requirePrisma();
  const existingSameDay = await prisma.eventTemplate.findFirst({
    where: { venueId, weekday },
    select: { id: true },
  });
  if (existingSameDay) {
    return portalRedirect("/venue?scheduleError=duplicateWeekday");
  }

  await prisma.eventTemplate.create({
    data: {
      venueId,
      title,
      description,
      weekday,
      startTimeMin,
      endTimeMin,
      slotMinutes,
      breakMinutes,
      timeZone,
      isPublic: true,
      performanceFormat,
      bookingRestrictionMode,
      restrictionHoursBefore,
      onPremiseMaxDistanceMeters,
    },
  });

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      seriesStartDate,
      seriesEndDate,
      bookingOpensDaysAhead,
    },
  });

  revalidatePath("/venue");
  await advanceVenueGrowthListingLive(venueId);
  return portalRedirect("/venue?scheduleSuccess=template");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


/**
 * Create or update one template per selected weekday (latest match per day wins),
 * update venue booking window, then materialize instances + slots for all templates
 * in range. Booked slots are never overwritten or removed.
 * Bulk generation runs only the newest template per weekday (see dedupe below).
 */
export async function saveWeeklyScheduleAndGenerateSlots(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  console.info("[venue weekly submit] server action start");
  const session = await getSession();
  if (!session || session.kind !== "venue") {
    console.warn("[venue weekly submit] no venue session");
    return portalRedirect("/login/venue?next=%2Fvenue");
  }
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForVenueSession(session);
  console.info("[venue weekly submit] session/access check", {
    venueId,
    allowedCount: allowed.length,
  });
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const scheduleMode = optString(formData, "scheduleMode") ?? "recurring";
  const isOneEvent = scheduleMode === "one_event";

  const title = reqString(formData, "title");
  const startTimeMin = scheduleTimeMinutesFromForm(formData, "startTime");
  const endTimeMin = scheduleTimeMinutesFromForm(formData, "endTime");
  if (endTimeMin <= startTimeMin) return portalRedirect("/venue?scheduleError=invalidTime");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");
  console.info("[venue weekly submit] parsed base inputs", {
    scheduleMode,
    title,
    startTimeMin,
    endTimeMin,
    slotMinutes,
    breakMinutes,
  });

  const prisma = requirePrisma();
  console.info("[venue weekly submit] prisma ready");
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      timeZone: true,
      slug: true,
      bookingRestrictionMode: true,
      restrictionHoursBefore: true,
      onPremiseMaxDistanceMeters: true,
      subscriptionTier: true,
      performanceFormat: true,
      seriesStartDate: true,
      seriesEndDate: true,
    },
  });
  if (!venue) return portalRedirect("/venue?venueError=venueMissing");
  console.info("[venue weekly submit] venue loaded", {
    hasSeriesStart: Boolean(venue.seriesStartDate),
    hasSeriesEnd: Boolean(venue.seriesEndDate),
    subscriptionTier: venue.subscriptionTier,
  });

  const timeZone = venue.timeZone ?? "America/Chicago";

  let weekdays: Weekday[];
  let seriesStartDate: Date;
  let seriesEndDate: Date;

  if (isOneEvent) {
    const startIso = reqString(formData, "seriesStartDate");
    const endIso = reqString(formData, "seriesEndDate");
    if (startIso !== endIso) return portalRedirect("/venue?scheduleError=badRange");
    seriesStartDate = new Date(`${startIso}T00:00:00.000Z`);
    seriesEndDate = seriesStartDate;
    weekdays = [weekdayFromIsoDateInTimeZone(startIso, timeZone)];
  } else {
    weekdays = parseWeekdaysFromForm(formData);
    if (weekdays.length === 0) {
      return portalRedirect("/venue?scheduleError=noWeekdays");
    }
    seriesStartDate = reqDate(formData, "seriesStartDate");
    seriesEndDate = reqDate(formData, "seriesEndDate");
    if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
      return portalRedirect("/venue?scheduleError=badRange");
    }
  }
  console.info("[venue weekly submit] resolved date/weekday targets", {
    weekdayCount: weekdays.length,
    weekdays,
    seriesStartDate: seriesStartDate.toISOString(),
    seriesEndDate: seriesEndDate.toISOString(),
  });

  /** For one-off nights, widen (never shrink) the venue booking window so other recurring nights stay valid. */
  console.info("[venue weekly submit] booking window normalization start");
  let venueSeriesStartForDb = seriesStartDate;
  let venueSeriesEndForDb = seriesEndDate;
  if (isOneEvent) {
    const curS = venue.seriesStartDate;
    const curE = venue.seriesEndDate;
    if (curS && curE) {
      const cs = curS.getTime();
      const ce = curE.getTime();
      if (cs <= ce) {
        const ns = seriesStartDate.getTime();
        const ne = seriesEndDate.getTime();
        venueSeriesStartForDb = ns < cs ? seriesStartDate : curS;
        venueSeriesEndForDb = ne > ce ? seriesEndDate : curE;
      }
    }
  }
  console.info("[venue weekly submit] booking window normalization done");
  const maxHorizonDays = venue.subscriptionTier === "FREE" ? 60 : 90;

  console.info("[venue weekly submit] booking window bounds start");
  let bookingOpensDaysAhead = 1;
  try {
    const nowForBounds = new Date();
    const seriesStartYmd = storageYmdUtc(seriesStartDate);
    const seriesEndYmd = storageYmdUtc(seriesEndDate);
    const storedWindowStartYmd = storageYmdUtc(venueSeriesStartForDb);
    const storedWindowEndYmd = storageYmdUtc(venueSeriesEndForDb);
    console.info("[venue weekly submit] bounds step: ymd keys", {
      isOneEvent,
      seriesStartYmd,
      seriesEndYmd,
      storedWindowStartYmd,
      storedWindowEndYmd,
    });

    const bounds = assertVenueYmdRangeWithinHorizon({
      venueTz: timeZone,
      now: nowForBounds,
      maxHorizonDays,
      seriesStartYmd,
      seriesEndYmd,
      storedWindowStartYmd,
      storedWindowEndYmd,
    });
    if (!bounds.ok) {
      console.info("[venue weekly submit] booking window bounds returned redirect");
      return bounds.redirect;
    }

    if (bounds.storedBookingWindowStartClampedToVenueToday) {
      venueSeriesStartForDb = new Date(`${bounds.effectiveBookingWindowStartYmd}T00:00:00.000Z`);
      console.info("[venue weekly submit] booking window start clamped for DB + generation", {
        storedBookingWindowStartYmd: bounds.storedBookingWindowStartYmd,
        effectiveBookingWindowStartYmd: bounds.effectiveBookingWindowStartYmd,
      });
    }
    console.info("[venue weekly submit] booking window bounds done", {
      storedBookingWindowStartYmd: bounds.storedBookingWindowStartYmd,
      effectiveBookingWindowStartYmd: bounds.effectiveBookingWindowStartYmd,
      storedBookingWindowStartClampedToVenueToday: bounds.storedBookingWindowStartClampedToVenueToday,
    });

    let tzForDays = typeof timeZone === "string" ? timeZone.trim() : "";
    if (!tzForDays) {
      tzForDays = "America/Chicago";
      console.info("[venue weekly submit] bookingOpens: blank venue timezone fallback", { tzForDays });
    } else if (!isValidIanaTimeZone(tzForDays)) {
      console.info("[venue weekly submit] bookingOpens: invalid timezone fallback", { rejected: tzForDays });
      tzForDays = "America/Chicago";
    }
    const todayVenueYmdForBooking = venueTodayYmdFromIanaZone(tzForDays, nowForBounds);
    console.info("[venue weekly submit] bounds step: bookingOpens base todayVenueYmd", {
      todayVenueYmdForBooking,
    });
    const diffDays = wholeDaysBetweenYmd(todayVenueYmdForBooking, storedWindowEndYmd);
    console.info("[venue weekly submit] bounds step: wholeDaysBetween venue today and stored end", {
      diffDays,
      storedWindowEndYmd,
    });
    if (!Number.isFinite(diffDays)) {
      console.error("[venue weekly submit] bounds fail: non-finite day diff", {
        todayVenueYmdForBooking,
        storedWindowEndYmd,
      });
      return portalRedirect("/venue?scheduleError=boundsCalc");
    }
    bookingOpensDaysAhead = Math.max(1, Math.min(maxHorizonDays, Math.round(diffDays)));
    console.info("[venue weekly submit] booking window computed", {
      maxHorizonDays,
      bookingOpensDaysAhead,
      venueSeriesStartForDb: venueSeriesStartForDb.toISOString(),
      venueSeriesEndForDb: venueSeriesEndForDb.toISOString(),
    });
  } catch (e) {
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[venue weekly submit] booking window bounds block error", {
      error: e,
      stack,
      venueTimeZoneRaw: timeZone,
    });
    return portalRedirect("/venue?scheduleError=boundsCalc");
  }

  console.info("[venue weekly submit] restriction parsing start");
  const bookingRestrictionModeStr =
    optString(formData, "bookingRestrictionMode") ?? venue.bookingRestrictionMode ?? "NONE";
  if (!ALLOWED_BOOKING_MODES.has(bookingRestrictionModeStr)) return portalRedirect("/venue?profileError=format");
  const bookingRestrictionMode = bookingRestrictionModeStr as BookingRestrictionMode;

  const restrictionHoursBefore = optInt(formData, "restrictionHoursBefore") ?? venue.restrictionHoursBefore ?? 6;
  const onPremiseMaxDistanceMeters =
    optInt(formData, "onPremiseMaxDistanceMeters") ?? venue.onPremiseMaxDistanceMeters ?? 1000;

  const performanceFormat = parseVenuePerformanceFormat(
    optString(formData, "performanceFormat"),
    venue.performanceFormat,
  );
  console.info("[venue weekly submit] restriction parsing done", {
    bookingRestrictionMode,
    restrictionHoursBefore,
    onPremiseMaxDistanceMeters,
    performanceFormat,
  });

  const description = normalizeOpenMicDescription(optString(formData, "description"));

  const templatePayload = {
    title,
    description,
    startTimeMin,
    endTimeMin,
    slotMinutes,
    breakMinutes,
    timeZone,
    isPublic: true,
    performanceFormat,
    bookingRestrictionMode,
    restrictionHoursBefore,
    onPremiseMaxDistanceMeters,
  };
  console.info("[venue weekly submit] template payload ready");

  console.info("[venue weekly submit] template upsert start", { weekdays });
  for (const weekday of weekdays) {
    console.info("[venue weekly submit] template upsert weekday begin", { weekday });
    const existing = await prisma.eventTemplate.findFirst({
      where: { venueId, weekday },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    console.info("[venue weekly submit] template upsert weekday lookup done", {
      weekday,
      existingTemplateId: existing?.id ?? null,
    });
    if (existing) {
      await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: templatePayload,
      });
      console.info("[venue weekly submit] template upsert weekday updated", {
        weekday,
        templateId: existing.id,
      });
    } else {
      const created = await prisma.eventTemplate.create({
        data: { venueId, weekday, ...templatePayload },
      });
      console.info("[venue weekly submit] template upsert weekday created", {
        weekday,
        templateId: created.id,
      });
    }
  }
  console.info("[venue weekly submit] template upsert done");

  console.info("[venue weekly submit] venue update start");
  await prisma.venue.update({
    where: { id: venueId },
    data: {
      seriesStartDate: venueSeriesStartForDb,
      seriesEndDate: venueSeriesEndForDb,
      bookingOpensDaysAhead,
    },
  });
  console.info("[venue weekly submit] venue booking window saved");

  console.info("[venue weekly submit] venue rules snapshot fetch start");
  const venueForRules = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      seriesStartDate: true,
      seriesEndDate: true,
      bookingOpensDaysAhead: true,
      timeZone: true,
    },
  });
  if (!venueForRules) return portalRedirect("/venue?venueError=venueMissing");
  console.info("[venue weekly submit] venue rules snapshot loaded");

  console.info("[venue weekly submit] template fetch for generation start");
  const allVenueTemplates = await prisma.eventTemplate.findMany({
    // Keep generation bounded to the weekdays touched by this save.
    where: { venueId, weekday: { in: weekdays } },
    orderBy: { updatedAt: "desc" },
  });
  console.info("[venue weekly submit] templates fetched for generation", { count: allVenueTemplates.length });
  /** One template per weekday for bulk sync: newest `updatedAt` wins (matches weekly upsert target). */
  const seenWeekday = new Set<Weekday>();
  const templates = allVenueTemplates.filter((t) => {
    if (seenWeekday.has(t.weekday)) return false;
    seenWeekday.add(t.weekday);
    return true;
  });
  console.info("[venue weekly submit] deduped templates", { count: templates.length });

  let generatedInstanceCount = 0;
  let transactionCount = 0;
  for (const template of templates) {
    console.info("[venue weekly submit] generating template start", {
      templateId: template.id,
      weekday: template.weekday,
    });
    const specs = generateSlotsForWindow({
      startTimeMin: template.startTimeMin,
      endTimeMin: template.endTimeMin,
      slotMinutes: template.slotMinutes,
      breakMinutes: template.breakMinutes,
    });
    console.info("[venue weekly submit] slot specs ready", {
      templateId: template.id,
      slotsPerNight: specs.length,
    });

    const candidateDates =
      isOneEvent
        ? [{ storageDate: seriesStartDate, weekday: weekdays[0]! as Weekday }]
        : [...iterStorageDatesInVenueSeries(seriesStartDate, seriesEndDate, venueForRules.timeZone ?? timeZone)];
    console.info("[venue weekly submit] candidate dates prepared", {
      templateId: template.id,
      isOneEvent,
      candidateCount: candidateDates.length,
    });

    for (const { storageDate, weekday } of candidateDates) {
      console.info("[venue weekly submit] date loop begin", {
        templateId: template.id,
        storageDate: storageDate.toISOString(),
        weekday,
      });
      if (weekday !== template.weekday) {
        console.info("[venue weekly submit] date loop skip weekday mismatch", {
          templateId: template.id,
          templateWeekday: template.weekday,
          weekday,
        });
        continue;
      }
      if (!isDateInSeriesRange(venueForRules, storageDate)) {
        console.info("[venue weekly submit] date loop skip series range", {
          templateId: template.id,
          storageDate: storageDate.toISOString(),
        });
        continue;
      }
      if (!isWithinBookingWindow(venueForRules, storageDate)) {
        console.info("[venue weekly submit] date loop skip booking window", {
          templateId: template.id,
          storageDate: storageDate.toISOString(),
        });
        continue;
      }

      transactionCount += 1;
      if (transactionCount % 25 === 0) {
        console.info("[venue weekly submit] generation progress", {
          transactionCount,
          generatedInstanceCount,
          templateId: template.id,
          storageDate: storageDate.toISOString(),
        });
      }
      console.info("[venue weekly submit] transaction begin", {
        templateId: template.id,
        storageDate: storageDate.toISOString(),
      });
      await prisma.$transaction(async (tx) => {
        console.info("[venue weekly submit] tx start", {
          templateId: template.id,
          storageDate: storageDate.toISOString(),
        });
        const inst =
          (await tx.eventInstance.findUnique({
            where: { templateId_date: { templateId: template.id, date: storageDate } },
          })) ??
          (await tx.eventInstance.create({
            data: { templateId: template.id, date: storageDate },
          }));

        if (inst.isCancelled) return;

        await syncSlotsForInstance(tx, inst.id, specs);
        generatedInstanceCount += 1;
        console.info("[venue weekly submit] tx done", {
          templateId: template.id,
          instanceId: inst.id,
          generatedInstanceCount,
        });
      });
      console.info("[venue weekly submit] transaction end", {
        templateId: template.id,
        storageDate: storageDate.toISOString(),
      });
    }
    console.info("[venue weekly submit] generating template done", {
      templateId: template.id,
    });
  }
  console.info("[venue weekly submit] generation complete", {
    transactionCount,
    generatedInstanceCount,
  });

  revalidatePath("/venue");
  revalidatePath(`/venues/${venue.slug}`);
  await advanceVenueGrowthListingLive(venueId);
  console.info("[venue weekly submit] server action success");
  return portalRedirect("/venue?scheduleSuccess=weekly");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    console.error("[venue weekly submit] server action unexpected error", e);
    return portalRedirect("/venue?scheduleError=submitFailed");
  }
}


export async function updateVenueProfile(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const about = optString(formData, "about") ?? null;
  const logoUrl = normalizeUrl(optString(formData, "logoUrl"));
  const imagePrimaryUrl = normalizeUrl(optString(formData, "imagePrimaryUrl"));
  const imageSecondaryUrl = normalizeUrl(optString(formData, "imageSecondaryUrl"));
  const websiteUrl = normalizeUrl(optString(formData, "websiteUrl"));
  const facebookUrl = normalizeUrl(optString(formData, "facebookUrl"));
  const instagramUrl = normalizeUrl(optString(formData, "instagramUrl"));
  const twitterUrl = normalizeUrl(optString(formData, "twitterUrl"));
  const tiktokUrl = normalizeUrl(optString(formData, "tiktokUrl"));
  const youtubeUrl = normalizeUrl(optString(formData, "youtubeUrl"));
  const soundcloudUrl = normalizeUrl(optString(formData, "soundcloudUrl"));

  await requirePrisma().venue.update({
    where: { id: venueId },
    data: {
      about,
      logoUrl,
      imagePrimaryUrl,
      imageSecondaryUrl,
      websiteUrl,
      facebookUrl,
      instagramUrl,
      twitterUrl,
      tiktokUrl,
      youtubeUrl,
      soundcloudUrl,
      providesPA: checkboxOn(formData, "providesPA"),
      providesSpeakersMics: checkboxOn(formData, "providesSpeakersMics"),
      providesMonitors: checkboxOn(formData, "providesMonitors"),
      providesDrumKit: checkboxOn(formData, "providesDrumKit"),
      providesBassAmp: checkboxOn(formData, "providesBassAmp"),
      providesGuitarAmp: checkboxOn(formData, "providesGuitarAmp"),
      providesKeyboard: checkboxOn(formData, "providesKeyboard"),
      providesDiBox: checkboxOn(formData, "providesDiBox"),
      providesLightingBasic: checkboxOn(formData, "providesLightingBasic"),
      providesBacklineShared: checkboxOn(formData, "providesBacklineShared"),
    },
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect("/venue?profile=saved");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


const VENUE_UPLOAD_FIELD: Record<"logo" | "primary" | "secondary", string> = {
  logo: "venueUploadLogo",
  primary: "venueUploadPrimary",
  secondary: "venueUploadSecondary",
};

async function readNamedImageFile(
  formData: FormData,
  fieldName: string,
): Promise<{ buf: Buffer; type: string } | { error: string }> {
  const file = formData.get(fieldName);
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "missing_file" };
  }
  const blob = file as File;
  const type = (blob.type || "").split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const buf = Buffer.from(await blob.arrayBuffer());
  return { buf, type };
}

async function uploadVenueProfileImageSlot(
  formData: FormData,
  slot: "logo" | "primary" | "secondary",
): Promise<VenuePortalActionResult> {
  try {
    const session = await requireVenueSession();
    const venueIdRaw = formData.get("venueId");
    const venueId = typeof venueIdRaw === "string" ? venueIdRaw.trim() : "";
    if (!venueId) {
      return portalRedirect("/venue?profileError=invalidForm");
    }
    const allowed = await venueIdsForSession(session);
    if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

    const field = VENUE_UPLOAD_FIELD[slot];
    const read = await readNamedImageFile(formData, field);
    if ("error" in read) {
      return portalRedirect("/venue?profileError=uploadMissing");
    }

    const stored = await storeProfileImage(read.buf, read.type, `venue/${venueId}/${slot}-${Date.now()}`);
    if (!stored.ok) {
      return portalRedirect(`/venue?profileError=upload_${stored.error}`);
    }

    const data =
      slot === "logo"
        ? { logoUrl: stored.publicUrl }
        : slot === "primary"
          ? { imagePrimaryUrl: stored.publicUrl }
          : { imageSecondaryUrl: stored.publicUrl };

    const prisma = requirePrisma();
    await prisma.venue.update({ where: { id: venueId }, data });
    const v = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
    revalidatePath("/venue");
    if (v?.slug) revalidatePath(`/venues/${v.slug}`);
    return portalRedirect("/venue?profile=imageUploaded");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}

export async function uploadVenueLogoImage(formData: FormData): Promise<VenuePortalActionResult> {
  return uploadVenueProfileImageSlot(formData, "logo");
}

export async function uploadVenuePrimaryImage(formData: FormData): Promise<VenuePortalActionResult> {
  return uploadVenueProfileImageSlot(formData, "primary");
}

export async function uploadVenueSecondaryImage(formData: FormData): Promise<VenuePortalActionResult> {
  return uploadVenueProfileImageSlot(formData, "secondary");
}

export async function inviteManager(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  if (!session.venueOwnerId) return portalRedirect("/venue?inviteError=ownerOnly");

  const venueId = reqString(formData, "venueId");
  const managerEmail = reqString(formData, "managerEmail").toLowerCase();
  const tempPassword = reqString(formData, "tempPassword");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await requirePrisma().$transaction(async (tx) => {
    const manager =
      (await tx.venueManager.findUnique({ where: { email: managerEmail } })) ??
      (await tx.venueManager.create({ data: { email: managerEmail, passwordHash } }));

    await tx.venueManagerAccess.upsert({
      where: { venueId_managerId: { venueId, managerId: manager.id } },
      update: { role: "MANAGER" },
      create: { venueId, managerId: manager.id, role: "MANAGER" },
    });
  });

  revalidatePath("/venue");
  return portalRedirect("/venue?invite=sent");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


export async function houseBookSlot(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const performerName = reqString(formData, "performerName");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const slotPreview = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: {
      booking: true,
      instance: { include: { template: { include: { venue: true } } } },
    },
  });
  if (!slotPreview) return portalRedirect("/venue?houseBookError=missing");
  if (slotPreview.instance.template.venueId !== venueId) return portalRedirect("/venue?venueError=forbidden");

  const instanceVenue = slotPreview.instance.template.venue;
  const instanceBlock = bookingBlockReason(instanceVenue, slotPreview.instance.date);
  if (instanceBlock) return portalRedirect("/venue?houseBookError=blocked");

  if (slotPreview.instance.isCancelled) return portalRedirect("/venue?houseBookError=cancelled");

  const slotStartUtc = slotStartInstant(
    slotPreview.instance.date,
    slotPreview.startMin,
    slotPreview.instance.template.timeZone,
  );
  if (slotStartUtc.getTime() <= Date.now()) return portalRedirect("/venue?houseBookError=past");

  if (slotPreview.booking && !slotPreview.booking.cancelledAt) return portalRedirect("/venue?houseBookError=taken");

  try {
    await requirePrisma().$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: { booking: true },
      });
      if (!slot) throw new Error("HOUSE_BOOK_MISSING");
      if (slot.booking && !slot.booking.cancelledAt) throw new Error("HOUSE_BOOK_TAKEN");

      if (slot.booking && slot.booking.cancelledAt) {
        await tx.booking.update({
          where: { id: slot.booking.id },
          data: {
            musicianId: null,
            performerName,
            performerEmail: null,
            notes: null,
            cancelledAt: null,
          },
        });
      } else {
        await tx.booking.create({
          data: {
            slotId: slot.id,
            musicianId: null,
            performerName,
            performerEmail: null,
            notes: null,
          },
        });
      }

      await tx.slot.update({
        where: { id: slot.id },
        data: { status: "RESERVED", manualLineupLabel: null },
      });

      await touchVenuePerformerHistoryForManual(tx, venueId, performerName);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "HOUSE_BOOK_MISSING") return portalRedirect("/venue?houseBookError=missing");
    if (msg === "HOUSE_BOOK_TAKEN") return portalRedirect("/venue?houseBookError=taken");
    throw e;
  }

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect("/venue?houseBook=1");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


export async function upgradeVenuePlan(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");
  if (!session.venueOwnerId) return portalRedirect("/venue?planError=ownerOnly");

  // Placeholder: real payment integration (Stripe/etc.) is not wired yet.
  // To avoid accidental production “free upgrades”, only allow manual upgrades in dev.
  if (process.env.NODE_ENV === "production") {
    return portalRedirect("/venue?planError=paymentsDisabled");
  }

  await requirePrisma().venue.update({
    where: { id: venueId },
    data: { subscriptionTier: "PRO" },
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect("/venue?planSuccess=1");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


/**
 * Per-slot booking rule override. `slotBookingRule=inherit` clears overrides (template defaults apply).
 */
export async function updateSlotBookingRules(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const ruleRaw = optString(formData, "slotBookingRule") ?? "inherit";

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) return portalRedirect("/venue?venueError=forbidden");

  if (ruleRaw === "inherit") {
    await requirePrisma().slot.update({
      where: { id: slotId },
      data: {
        bookingRestrictionModeOverride: null,
        restrictionHoursBeforeOverride: null,
        onPremiseMaxDistanceMetersOverride: null,
      },
    });
  } else {
    if (!ALLOWED_BOOKING_MODES.has(ruleRaw)) return portalRedirect("/venue?venueError=invalidForm");
    const tpl = slot.instance.template;
    const hours = optInt(formData, "restrictionHoursBefore") ?? tpl.restrictionHoursBefore;
    const meters = optInt(formData, "onPremiseMaxDistanceMeters") ?? tpl.onPremiseMaxDistanceMeters;
    await requirePrisma().slot.update({
      where: { id: slotId },
      data: {
        bookingRestrictionModeOverride: ruleRaw as BookingRestrictionMode,
        restrictionHoursBeforeOverride: hours,
        onPremiseMaxDistanceMetersOverride: meters,
      },
    });
  }

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect("/venue?slotRule=saved");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


/** One horizontal row: time, artist label, simplified rule tier, save. */
export async function updateVenueSlotLine(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const tierRaw = reqString(formData, "lineupRuleTier");
  if (!isLineupRuleTier(tierRaw)) return portalRedirect("/venue?venueError=invalidForm");
  const startTimeStr = reqString(formData, "startTime");
  const newStartMin = timeInputValueToMinutes(startTimeStr);
  if (newStartMin == null) return portalRedirect("/venue?venueError=invalidForm");
  const artistField = optString(formData, "artistDisplay");
  const selectedMusicianIdRaw = optString(formData, "selectedMusicianId");
  const selectedMusicianId =
    selectedMusicianIdRaw && selectedMusicianIdRaw.length > 0 ? selectedMusicianIdRaw : null;

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) return portalRedirect("/venue?venueError=forbidden");

  const tpl = slot.instance.template;
  const duration = slot.endMin - slot.startMin;
  const newEndMin = newStartMin + duration;
  if (newStartMin < tpl.startTimeMin || newEndMin > tpl.endTimeMin) {
    return portalRedirect(buildVenuePortalRedirect("venueError=invalidForm", formData));
  }

  const overrides = prismaOverridesForLineupRuleTierSelection(tierRaw, tpl);
  const activeBooking = slot.booking && !slot.booking.cancelledAt ? slot.booking : null;
  const hasMusician = Boolean(activeBooking?.musicianId);

  const baseData = {
    startMin: newStartMin,
    endMin: newEndMin,
    bookingRestrictionModeOverride: overrides.bookingRestrictionModeOverride,
    restrictionHoursBeforeOverride: overrides.restrictionHoursBeforeOverride,
    onPremiseMaxDistanceMetersOverride: overrides.onPremiseMaxDistanceMetersOverride,
  };

  await requirePrisma().$transaction(async (tx) => {
    const slotRow = await tx.slot.findUnique({
      where: { id: slotId },
      include: { booking: true },
    });
    if (!slotRow) return;
    const ab = slotRow.booking && !slotRow.booking.cancelledAt ? slotRow.booking : null;
    const lockedMusician = Boolean(ab?.musicianId);

    let linkMusician: { id: string; stageName: string; email: string } | null = null;
    if (selectedMusicianId) {
      const m = await tx.musicianUser.findUnique({
        where: { id: selectedMusicianId },
        select: { id: true, stageName: true, email: true },
      });
      if (m) linkMusician = m;
    }

    if (lockedMusician) {
      await tx.slot.update({ where: { id: slotId }, data: baseData });
      return;
    }

    if (linkMusician) {
      if (ab && !ab.musicianId) {
        await tx.booking.update({
          where: { id: ab.id },
          data: {
            musicianId: linkMusician.id,
            performerName: linkMusician.stageName.trim(),
            performerEmail: linkMusician.email,
          },
        });
      } else if (!ab) {
        await tx.booking.create({
          data: {
            slotId,
            musicianId: linkMusician.id,
            performerName: linkMusician.stageName.trim(),
            performerEmail: linkMusician.email,
            notes: null,
          },
        });
      }
      await tx.slot.update({
        where: { id: slotId },
        data: { ...baseData, manualLineupLabel: null, status: "RESERVED" },
      });
      await touchVenuePerformerHistoryForMusician(tx, venueId, linkMusician.id);
      return;
    }

    const trimmedArtist = artistField?.trim() ?? "";

    if (ab && !ab.musicianId) {
      const nextName = trimmedArtist || ab.performerName;
      await tx.booking.update({
        where: { id: ab.id },
        data: { performerName: nextName },
      });
      await tx.slot.update({
        where: { id: slotId },
        data: { ...baseData, manualLineupLabel: null },
      });
      if (nextName.trim()) await touchVenuePerformerHistoryForManual(tx, venueId, nextName.trim());
      return;
    }

    await tx.slot.update({
      where: { id: slotId },
      data: {
        ...baseData,
        manualLineupLabel: trimmedArtist ? trimmedArtist : null,
      },
    });
    if (trimmedArtist) await touchVenuePerformerHistoryForManual(tx, venueId, trimmedArtist);
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect(buildVenuePortalRedirect("slotLine=saved", formData));
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


export async function deleteVenueSlot(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) return portalRedirect("/venue?venueError=forbidden");

  const active = slot.booking && !slot.booking.cancelledAt ? slot.booking : null;
  if (active?.musicianId) return portalRedirect(buildVenuePortalRedirect("slotDeleteError=musicianBooked", formData));

  await requirePrisma().slot.delete({ where: { id: slotId } });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect(buildVenuePortalRedirect("slotDeleted=1", formData));
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


/**
 * Remove all EventInstances (and cascaded slots/bookings) for this venue on a single calendar date.
 * Does not delete EventTemplates. Blocks if any slot has an active musician booking.
 */
export async function deleteVenueOpenMicDay(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const dateYmd = reqString(formData, "dateYmd");
  if (!isValidLineupYmd(dateYmd)) return portalRedirect("/venue?venueError=invalidForm");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const dayStart = new Date(`${dateYmd}T00:00:00.000Z`);
  const prisma = requirePrisma();

  const instances = await prisma.eventInstance.findMany({
    where: { date: dayStart, template: { venueId } },
    include: { slots: { include: { booking: true } } },
  });
  if (instances.length === 0) return portalRedirect("/venue?dayDeleteError=noInstances");

  for (const inst of instances) {
    for (const slot of inst.slots) {
      const b = slot.booking;
      if (b && !b.cancelledAt && b.musicianId) {
        return portalRedirect("/venue?dayDeleteError=musicianBooked");
      }
    }
  }

  await prisma.eventInstance.deleteMany({
    where: { id: { in: instances.map((i) => i.id) } },
  });

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  revalidatePath("/venue");
  if (venue?.slug) revalidatePath(`/venues/${venue.slug}`);

  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const remainingRows = await prisma.eventInstance.findMany({
    where: { template: { venueId }, date: { gte: startToday } },
    select: { date: true },
  });
  const remainingYmds = [...new Set(remainingRows.map((r) => storageYmdUtc(r.date)))].sort();
  const nextYmd = remainingYmds[0] ?? null;
  if (nextYmd) {
    return portalRedirect(`/venue?dayDeleted=1&lineupDay=${encodeURIComponent(nextYmd)}`);
  }
  return portalRedirect("/venue?dayDeleted=1");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}


/** Manual history rows only: toggle visibility on the public venue page. */
export async function toggleVenuePerformerHistoryPublic(formData: FormData): Promise<VenuePortalActionResult> {
  try {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const historyId = reqString(formData, "historyId");
  const nextRaw = reqString(formData, "nextPublic");
  const nextPublic = nextRaw === "1";

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

  const row = await requirePrisma().venuePerformerHistory.findUnique({
    where: { id: historyId },
    select: { venueId: true, kind: true },
  });
  if (!row || row.venueId !== venueId) return portalRedirect("/venue?venueError=forbidden");
  if (row.kind !== VenuePerformerHistoryKind.MANUAL) return portalRedirect("/venue?venueError=invalidForm");

  await requirePrisma().venuePerformerHistory.update({
    where: { id: historyId },
    data: { showOnPublicProfile: nextPublic },
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  return portalRedirect("/venue?performerHistory=toggled");
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}

const LINEUP_TEST_CONFIRM_DAY = "CLEAR LINEUP TEST DATA";
const LINEUP_TEST_CONFIRM_VENUE = "CLEAR ALL LINEUP DATA FOR THIS VENUE";

/** Destructive: clears bookings / manual labels / reconciles performer history for a night or whole venue. Never deletes accounts or slot rows. */
export async function clearVenueLineupTestDataAction(formData: FormData): Promise<VenuePortalActionResult> {
  try {
    if (!isVenueLineupTestCleanupUiEnabled()) {
      return portalRedirect("/venue?venueError=featureDisabled");
    }
    const session = await requireVenueSession();
    const venueId = reqString(formData, "venueId");
    const allowed = await venueIdsForSession(session);
    if (!allowed.includes(venueId)) return portalRedirect("/venue?venueError=forbidden");

    const scopeRaw = (optString(formData, "cleanupScope") ?? "selected_day").trim();
    const scope = scopeRaw === "entire_venue" ? ("entire_venue" as const) : ("selected_day" as const);
    const dateYmdRaw = optString(formData, "dateYmd") ?? "";
    const confirmEntry = formData.get("confirmPhrase");
    const confirm = typeof confirmEntry === "string" ? confirmEntry.trim() : "";

    if (scope === "selected_day") {
      if (!dateYmdRaw || !isValidLineupYmd(dateYmdRaw)) {
        return portalRedirect("/venue?lineupTestCleanupError=needDay");
      }
      if (confirm !== LINEUP_TEST_CONFIRM_DAY) {
        return portalRedirect("/venue?lineupTestCleanupError=confirm");
      }
    } else {
      if (confirm !== LINEUP_TEST_CONFIRM_VENUE) {
        return portalRedirect("/venue?lineupTestCleanupError=confirmVenue");
      }
    }

    const prisma = requirePrisma();
    const result = await runVenueLineupTestCleanup(prisma, {
      venueId,
      scope,
      dateYmd: scope === "selected_day" ? dateYmdRaw : null,
    });

    revalidatePath("/venue");
    const v = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
    if (v?.slug) {
      revalidatePath(`/venues/${v.slug}`);
      if (scope === "selected_day" && dateYmdRaw) {
        revalidatePath(`/venues/${v.slug}/lineup/${dateYmdRaw}`);
      }
    }

    const q = new URLSearchParams();
    q.set("lineupTestCleanup", "ok");
    q.set("ltcScope", result.scope);
    if (result.dateYmd) q.set("ltcYmd", result.dateYmd);
    q.set("ltcBookings", String(result.bookingsDeleted));
    q.set("ltcManual", String(result.slotsManualLabelCleared));
    q.set("ltcAvail", String(result.slotsReservedResetToAvailable));
    q.set("ltcHistDel", String(result.performerHistoryRowsDeleted));
    q.set("ltcHistDec", String(result.performerHistoryRowsDecremented));
    q.set("ltcInst", String(result.instanceCount));
    q.set("ltcSlots", String(result.slotCount));
    if (scope === "selected_day" && dateYmdRaw) q.set("lineupDay", dateYmdRaw);
    return portalRedirect(`/venue?${q.toString()}`);
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}

/** `<form action>` typing expects `Promise<void>`; delegates to {@link clearVenueLineupTestDataAction}. */
export async function clearVenueLineupTestDataFormAction(formData: FormData): Promise<void> {
  void (await clearVenueLineupTestDataAction(formData));
}
