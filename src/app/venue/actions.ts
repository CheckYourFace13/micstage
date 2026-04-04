"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
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
import { BookingRestrictionMode, VenuePerformerHistoryKind, Weekday } from "@/generated/prisma/client";
import { BOOKING_RESTRICTION_OPTIONS } from "@/lib/bookingRestrictionUi";
import { isLineupRuleTier, prismaOverridesForLineupRuleTier } from "@/lib/lineupRuleTiers";
import { timeInputValueToMinutes } from "@/lib/time";
import { parseVenuePerformanceFormat } from "@/lib/venuePerformanceFormat";
import {
  touchVenuePerformerHistoryForManual,
  touchVenuePerformerHistoryForMusician,
} from "@/lib/venuePerformerHistory";

/** Missing/tampered fields → friendly portal message instead of generic error UI. */
function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) redirect("/venue?venueError=invalidForm");
  return v.trim();
}

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Keep venue dashboard on the same lineup day after slot actions (optional `lineupDay` on form). */
function redirectVenueWithOptionalLineupDay(query: string, formData: FormData): never {
  const day = optString(formData, "lineupDay");
  const suffix = day && isValidLineupYmd(day) ? `&lineupDay=${encodeURIComponent(day)}` : "";
  redirect(`/venue?${query}${suffix}`);
}

function reqInt(formData: FormData, key: string): number {
  const v = reqString(formData, key);
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) redirect("/venue?venueError=invalidForm");
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
  if (Number.isNaN(d.getTime())) redirect("/venue?venueError=invalidForm");
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

function firstMatchingLink(links: string[], patterns: RegExp[]): string | null {
  for (const l of links) {
    if (patterns.some((p) => p.test(l))) return l;
  }
  return null;
}

const ALLOWED_BOOKING_MODES = new Set<string>(BOOKING_RESTRICTION_OPTIONS.map((o) => o.value));

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
  if (typeof raw !== "string" || !raw.trim()) redirect("/venue?scheduleError=invalidTime");
  const t = raw.trim();
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) redirect("/venue?scheduleError=invalidTime");
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) redirect("/venue?scheduleError=invalidTime");
  return hh * 60 + mm;
}

export async function createEventTemplate(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const title = reqString(formData, "title");
  const weekday = reqString(formData, "weekday") as Weekday;
  const startTimeMin = scheduleTimeMinutesFromForm(formData, "startTime");
  const endTimeMin = scheduleTimeMinutesFromForm(formData, "endTime");
  if (endTimeMin <= startTimeMin) redirect("/venue?scheduleError=invalidTime");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");
  const seriesStartDate = reqDate(formData, "seriesStartDate");
  const seriesEndDate = reqDate(formData, "seriesEndDate");
  if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
    redirect("/venue?scheduleError=badRange");
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
    redirect("/venue?scheduleError=badRange");
  }
  if (seriesEndDate.getTime() < todayUtc.getTime() || seriesEndDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?scheduleError=badRange");
  }

  const bookingOpensDaysAhead = Math.max(
    1,
    Math.min(maxHorizonDays, Math.round((seriesEndDate.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))),
  );

  const bookingRestrictionModeStr = optString(formData, "bookingRestrictionMode") ?? venue?.bookingRestrictionMode ?? "NONE";
  if (!ALLOWED_BOOKING_MODES.has(bookingRestrictionModeStr)) redirect("/venue?profileError=format");
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
    redirect("/venue?scheduleError=duplicateWeekday");
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
  redirect("/venue?scheduleSuccess=template");
}

/**
 * Create or update one template per selected weekday (latest match per day wins),
 * update venue booking window, then materialize instances + slots for all templates
 * in range. Booked slots are never overwritten or removed.
 * Bulk generation runs only the newest template per weekday (see dedupe below).
 */
export async function saveWeeklyScheduleAndGenerateSlots(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const scheduleMode = optString(formData, "scheduleMode") ?? "recurring";
  const isOneEvent = scheduleMode === "one_event";

  const title = reqString(formData, "title");
  const startTimeMin = scheduleTimeMinutesFromForm(formData, "startTime");
  const endTimeMin = scheduleTimeMinutesFromForm(formData, "endTime");
  if (endTimeMin <= startTimeMin) redirect("/venue?scheduleError=invalidTime");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");

  const prisma = requirePrisma();
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
  if (!venue) redirect("/venue?venueError=venueMissing");

  const timeZone = venue.timeZone ?? "America/Chicago";

  let weekdays: Weekday[];
  let seriesStartDate: Date;
  let seriesEndDate: Date;

  if (isOneEvent) {
    const startIso = reqString(formData, "seriesStartDate");
    const endIso = reqString(formData, "seriesEndDate");
    if (startIso !== endIso) redirect("/venue?scheduleError=badRange");
    seriesStartDate = new Date(`${startIso}T00:00:00.000Z`);
    seriesEndDate = seriesStartDate;
    weekdays = [weekdayFromIsoDateInTimeZone(startIso, timeZone)];
  } else {
    weekdays = parseWeekdaysFromForm(formData);
    if (weekdays.length === 0) {
      redirect("/venue?scheduleError=noWeekdays");
    }
    seriesStartDate = reqDate(formData, "seriesStartDate");
    seriesEndDate = reqDate(formData, "seriesEndDate");
    if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
      redirect("/venue?scheduleError=badRange");
    }
  }

  /** For one-off nights, widen (never shrink) the venue booking window so other recurring nights stay valid. */
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
  const maxHorizonDays = venue.subscriptionTier === "FREE" ? 60 : 90;

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizonEndUtc = new Date(todayUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

  if (seriesStartDate.getTime() < todayUtc.getTime() || seriesStartDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?scheduleError=badRange");
  }
  if (seriesEndDate.getTime() < todayUtc.getTime() || seriesEndDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?scheduleError=badRange");
  }

  if (
    venueSeriesStartForDb.getTime() < todayUtc.getTime() ||
    venueSeriesStartForDb.getTime() > horizonEndUtc.getTime() ||
    venueSeriesEndForDb.getTime() < todayUtc.getTime() ||
    venueSeriesEndForDb.getTime() > horizonEndUtc.getTime()
  ) {
    redirect("/venue?scheduleError=badRange");
  }

  const bookingOpensDaysAhead = Math.max(
    1,
    Math.min(maxHorizonDays, Math.round((venueSeriesEndForDb.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))),
  );

  const bookingRestrictionModeStr =
    optString(formData, "bookingRestrictionMode") ?? venue.bookingRestrictionMode ?? "NONE";
  if (!ALLOWED_BOOKING_MODES.has(bookingRestrictionModeStr)) redirect("/venue?profileError=format");
  const bookingRestrictionMode = bookingRestrictionModeStr as BookingRestrictionMode;

  const restrictionHoursBefore = optInt(formData, "restrictionHoursBefore") ?? venue.restrictionHoursBefore ?? 6;
  const onPremiseMaxDistanceMeters =
    optInt(formData, "onPremiseMaxDistanceMeters") ?? venue.onPremiseMaxDistanceMeters ?? 1000;

  const performanceFormat = parseVenuePerformanceFormat(
    optString(formData, "performanceFormat"),
    venue.performanceFormat,
  );

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

  for (const weekday of weekdays) {
    const existing = await prisma.eventTemplate.findFirst({
      where: { venueId, weekday },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: templatePayload,
      });
    } else {
      await prisma.eventTemplate.create({
        data: { venueId, weekday, ...templatePayload },
      });
    }
  }

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      seriesStartDate: venueSeriesStartForDb,
      seriesEndDate: venueSeriesEndForDb,
      bookingOpensDaysAhead,
    },
  });

  const venueForRules = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      seriesStartDate: true,
      seriesEndDate: true,
      bookingOpensDaysAhead: true,
      timeZone: true,
    },
  });
  if (!venueForRules) redirect("/venue?venueError=venueMissing");

  const allVenueTemplates = await prisma.eventTemplate.findMany({
    where: { venueId },
    orderBy: { updatedAt: "desc" },
  });
  /** One template per weekday for bulk sync: newest `updatedAt` wins (matches weekly upsert target). */
  const seenWeekday = new Set<Weekday>();
  const templates = allVenueTemplates.filter((t) => {
    if (seenWeekday.has(t.weekday)) return false;
    seenWeekday.add(t.weekday);
    return true;
  });

  for (const template of templates) {
    const specs = generateSlotsForWindow({
      startTimeMin: template.startTimeMin,
      endTimeMin: template.endTimeMin,
      slotMinutes: template.slotMinutes,
      breakMinutes: template.breakMinutes,
    });

    for (const { storageDate, weekday } of iterStorageDatesInVenueSeries(
      seriesStartDate,
      seriesEndDate,
      venueForRules.timeZone ?? timeZone,
    )) {
      if (weekday !== template.weekday) continue;
      if (!isDateInSeriesRange(venueForRules, storageDate)) continue;
      if (!isWithinBookingWindow(venueForRules, storageDate)) continue;

      await prisma.$transaction(async (tx) => {
        const inst =
          (await tx.eventInstance.findUnique({
            where: { templateId_date: { templateId: template.id, date: storageDate } },
          })) ??
          (await tx.eventInstance.create({
            data: { templateId: template.id, date: storageDate },
          }));

        if (inst.isCancelled) return;

        await syncSlotsForInstance(tx, inst.id, specs);
      });
    }
  }

  revalidatePath("/venue");
  revalidatePath(`/venues/${venue.slug}`);
  redirect("/venue?scheduleSuccess=weekly");
}

export async function updateVenueProfile(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

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
  redirect("/venue?profile=saved");
}

export async function discoverVenueSocials(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const venue = await requirePrisma().venue.findUnique({
    where: { id: venueId },
    select: { websiteUrl: true, slug: true },
  });
  const website = venue?.websiteUrl;
  if (!website) redirect("/venue?socialsError=needWebsite");

  let html = "";
  try {
    const res = await fetch(website, { redirect: "follow", cache: "no-store" });
    if (!res.ok) redirect("/venue?socialsError=fetchFailed");
    html = await res.text();
  } catch {
    redirect("/venue?socialsError=fetchFailed");
  }

  const links = Array.from(html.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map((m) => m[0]);
  const facebookUrl = firstMatchingLink(links, [/facebook\.com\//i]);
  const instagramUrl = firstMatchingLink(links, [/instagram\.com\//i]);
  const twitterUrl = firstMatchingLink(links, [/twitter\.com\//i, /x\.com\//i]);
  const tiktokUrl = firstMatchingLink(links, [/tiktok\.com\//i]);
  const youtubeUrl = firstMatchingLink(links, [/youtube\.com\//i, /youtu\.be\//i]);
  const soundcloudUrl = firstMatchingLink(links, [/soundcloud\.com\//i]);

  await requirePrisma().venue.update({
    where: { id: venueId },
    data: {
      facebookUrl,
      instagramUrl,
      twitterUrl,
      tiktokUrl,
      youtubeUrl,
      soundcloudUrl,
    },
  });

  revalidatePath("/venue");
  if (venue?.slug) revalidatePath(`/venues/${venue.slug}`);
  redirect("/venue?venueNotice=socialsDiscovered");
}

export async function inviteManager(formData: FormData) {
  const session = await requireVenueSession();
  if (!session.venueOwnerId) redirect("/venue?inviteError=ownerOnly");

  const venueId = reqString(formData, "venueId");
  const managerEmail = reqString(formData, "managerEmail").toLowerCase();
  const tempPassword = reqString(formData, "tempPassword");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

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
  redirect("/venue?invite=sent");
}

export async function houseBookSlot(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const performerName = reqString(formData, "performerName");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const slotPreview = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: {
      booking: true,
      instance: { include: { template: { include: { venue: true } } } },
    },
  });
  if (!slotPreview) redirect("/venue?houseBookError=missing");
  if (slotPreview.instance.template.venueId !== venueId) redirect("/venue?venueError=forbidden");

  const instanceVenue = slotPreview.instance.template.venue;
  const instanceBlock = bookingBlockReason(instanceVenue, slotPreview.instance.date);
  if (instanceBlock) redirect("/venue?houseBookError=blocked");

  if (slotPreview.instance.isCancelled) redirect("/venue?houseBookError=cancelled");

  const slotStartUtc = slotStartInstant(
    slotPreview.instance.date,
    slotPreview.startMin,
    slotPreview.instance.template.timeZone,
  );
  if (slotStartUtc.getTime() <= Date.now()) redirect("/venue?houseBookError=past");

  if (slotPreview.booking && !slotPreview.booking.cancelledAt) redirect("/venue?houseBookError=taken");

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
    if (msg === "HOUSE_BOOK_MISSING") redirect("/venue?houseBookError=missing");
    if (msg === "HOUSE_BOOK_TAKEN") redirect("/venue?houseBookError=taken");
    throw e;
  }

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  redirect("/venue?houseBook=1");
}

export async function upgradeVenuePlan(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");
  if (!session.venueOwnerId) redirect("/venue?planError=ownerOnly");

  // Placeholder: real payment integration (Stripe/etc.) is not wired yet.
  // To avoid accidental production “free upgrades”, only allow manual upgrades in dev.
  if (process.env.NODE_ENV === "production") {
    redirect("/venue?planError=paymentsDisabled");
  }

  await requirePrisma().venue.update({
    where: { id: venueId },
    data: { subscriptionTier: "PRO" },
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  redirect("/venue?planSuccess=1");
}

/**
 * Per-slot booking rule override. `slotBookingRule=inherit` clears overrides (template defaults apply).
 */
export async function updateSlotBookingRules(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const ruleRaw = optString(formData, "slotBookingRule") ?? "inherit";

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) redirect("/venue?venueError=forbidden");

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
    if (!ALLOWED_BOOKING_MODES.has(ruleRaw)) redirect("/venue?venueError=invalidForm");
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
  redirect("/venue?slotRule=saved");
}

/** One horizontal row: time, artist label, simplified rule tier, save. */
export async function updateVenueSlotLine(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const tierRaw = reqString(formData, "lineupRuleTier");
  if (!isLineupRuleTier(tierRaw)) redirect("/venue?venueError=invalidForm");
  const startTimeStr = reqString(formData, "startTime");
  const newStartMin = timeInputValueToMinutes(startTimeStr);
  if (newStartMin == null) redirect("/venue?venueError=invalidForm");
  const artistField = optString(formData, "artistDisplay");
  const selectedMusicianIdRaw = optString(formData, "selectedMusicianId");
  const selectedMusicianId =
    selectedMusicianIdRaw && selectedMusicianIdRaw.length > 0 ? selectedMusicianIdRaw : null;

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) redirect("/venue?venueError=forbidden");

  const tpl = slot.instance.template;
  const duration = slot.endMin - slot.startMin;
  const newEndMin = newStartMin + duration;
  if (newStartMin < tpl.startTimeMin || newEndMin > tpl.endTimeMin) {
    redirectVenueWithOptionalLineupDay("venueError=invalidForm", formData);
  }

  const overrides = prismaOverridesForLineupRuleTier(tierRaw, tpl);
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
  redirectVenueWithOptionalLineupDay("slotLine=saved", formData);
}

export async function deleteVenueSlot(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const slot = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: true } } },
  });
  if (!slot || slot.instance.template.venueId !== venueId) redirect("/venue?venueError=forbidden");

  const active = slot.booking && !slot.booking.cancelledAt ? slot.booking : null;
  if (active?.musicianId) redirectVenueWithOptionalLineupDay("slotDeleteError=musicianBooked", formData);

  await requirePrisma().slot.delete({ where: { id: slotId } });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  redirectVenueWithOptionalLineupDay("slotDeleted=1", formData);
}

/**
 * Remove all EventInstances (and cascaded slots/bookings) for this venue on a single calendar date.
 * Does not delete EventTemplates. Blocks if any slot has an active musician booking.
 */
export async function deleteVenueOpenMicDay(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const dateYmd = reqString(formData, "dateYmd");
  if (!isValidLineupYmd(dateYmd)) redirect("/venue?venueError=invalidForm");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const dayStart = new Date(`${dateYmd}T00:00:00.000Z`);
  const prisma = requirePrisma();

  const instances = await prisma.eventInstance.findMany({
    where: { date: dayStart, template: { venueId } },
    include: { slots: { include: { booking: true } } },
  });
  if (instances.length === 0) redirect("/venue?dayDeleteError=noInstances");

  for (const inst of instances) {
    for (const slot of inst.slots) {
      const b = slot.booking;
      if (b && !b.cancelledAt && b.musicianId) {
        redirect("/venue?dayDeleteError=musicianBooked");
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
    redirect(`/venue?dayDeleted=1&lineupDay=${encodeURIComponent(nextYmd)}`);
  }
  redirect("/venue?dayDeleted=1");
}

/** Manual history rows only: toggle visibility on the public venue page. */
export async function toggleVenuePerformerHistoryPublic(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const historyId = reqString(formData, "historyId");
  const nextRaw = reqString(formData, "nextPublic");
  const nextPublic = nextRaw === "1";

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect("/venue?venueError=forbidden");

  const row = await requirePrisma().venuePerformerHistory.findUnique({
    where: { id: historyId },
    select: { venueId: true, kind: true },
  });
  if (!row || row.venueId !== venueId) redirect("/venue?venueError=forbidden");
  if (row.kind !== VenuePerformerHistoryKind.MANUAL) redirect("/venue?venueError=invalidForm");

  await requirePrisma().venuePerformerHistory.update({
    where: { id: historyId },
    data: { showOnPublicProfile: nextPublic },
  });

  revalidatePath("/venue");
  const v = await requirePrisma().venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
  redirect("/venue?performerHistory=toggled");
}

