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
} from "@/lib/weeklySchedule";
import {
  bookingBlockReason,
  isDateInSeriesRange,
  isWithinBookingWindow,
  slotStartInstant,
} from "@/lib/venueBookingRules";
import { BookingRestrictionMode, VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
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
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
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
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
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

const FORMATS: VenuePerformanceFormat[] = [
  "OPEN_VARIETY",
  "ACOUSTIC_ONLY",
  "GUITAR_VOCAL_ONLY",
  "FULL_BANDS_ALLOWED",
  "COMEDY_SPOKEN_WORD",
];

function parsePerformanceFormat(v: string): VenuePerformanceFormat {
  if (FORMATS.includes(v as VenuePerformanceFormat)) return v as VenuePerformanceFormat;
  redirect("/venue?profileError=format");
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
    redirect("/venue?profileError=badRange");
  }

  const venue = await requirePrisma().venue.findUnique({
    where: { id: venueId },
    select: {
      timeZone: true,
      bookingRestrictionMode: true,
      restrictionHoursBefore: true,
      onPremiseMaxDistanceMeters: true,
      subscriptionTier: true,
    },
  });
  const timeZone = optString(formData, "timeZone") ?? venue?.timeZone ?? "America/Chicago";
  const maxHorizonDays = venue?.subscriptionTier === "FREE" ? 60 : 90;

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizonEndUtc = new Date(todayUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

  if (seriesStartDate.getTime() < todayUtc.getTime() || seriesStartDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?profileError=badRange");
  }
  if (seriesEndDate.getTime() < todayUtc.getTime() || seriesEndDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?profileError=badRange");
  }

  const bookingOpensDaysAhead = Math.max(
    1,
    Math.min(maxHorizonDays, Math.round((seriesEndDate.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))),
  );

  const bookingRestrictionModeStr = optString(formData, "bookingRestrictionMode") ?? venue?.bookingRestrictionMode ?? "NONE";
  const allowedModes: BookingRestrictionMode[] = ["NONE", "ATTENDEE_DAY_OF", "HOURS_BEFORE", "ON_PREMISE"];
  if (!allowedModes.includes(bookingRestrictionModeStr as BookingRestrictionMode)) redirect("/venue?profileError=format");
  const bookingRestrictionMode = bookingRestrictionModeStr as BookingRestrictionMode;

  const restrictionHoursBefore = optInt(formData, "restrictionHoursBefore") ?? venue?.restrictionHoursBefore ?? 6;
  const onPremiseMaxDistanceMeters = optInt(formData, "onPremiseMaxDistanceMeters") ?? venue?.onPremiseMaxDistanceMeters ?? 1000;

  const prisma = requirePrisma();
  const existingSameDay = await prisma.eventTemplate.findFirst({
    where: { venueId, weekday },
    select: { id: true },
  });
  if (existingSameDay) {
    redirect("/venue?profileError=duplicateWeekday");
  }

  await prisma.eventTemplate.create({
    data: {
      venueId,
      title,
      weekday,
      startTimeMin,
      endTimeMin,
      slotMinutes,
      breakMinutes,
      timeZone,
      isPublic: true,
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

  const weekdays = parseWeekdaysFromForm(formData);
  if (weekdays.length === 0) {
    redirect("/venue?scheduleError=noWeekdays");
  }

  const title = reqString(formData, "title");
  const startTimeMin = scheduleTimeMinutesFromForm(formData, "startTime");
  const endTimeMin = scheduleTimeMinutesFromForm(formData, "endTime");
  if (endTimeMin <= startTimeMin) redirect("/venue?scheduleError=invalidTime");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");
  const seriesStartDate = reqDate(formData, "seriesStartDate");
  const seriesEndDate = reqDate(formData, "seriesEndDate");
  if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
    redirect("/venue?profileError=badRange");
  }

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
    },
  });
  if (!venue) redirect("/venue?venueError=venueMissing");

  const timeZone = optString(formData, "timeZone") ?? venue.timeZone ?? "America/Chicago";
  const maxHorizonDays = venue.subscriptionTier === "FREE" ? 60 : 90;

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizonEndUtc = new Date(todayUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

  if (seriesStartDate.getTime() < todayUtc.getTime() || seriesStartDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?profileError=badRange");
  }
  if (seriesEndDate.getTime() < todayUtc.getTime() || seriesEndDate.getTime() > horizonEndUtc.getTime()) {
    redirect("/venue?profileError=badRange");
  }

  const bookingOpensDaysAhead = Math.max(
    1,
    Math.min(maxHorizonDays, Math.round((seriesEndDate.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))),
  );

  const bookingRestrictionModeStr =
    optString(formData, "bookingRestrictionMode") ?? venue.bookingRestrictionMode ?? "NONE";
  const allowedModes: BookingRestrictionMode[] = ["NONE", "ATTENDEE_DAY_OF", "HOURS_BEFORE", "ON_PREMISE"];
  if (!allowedModes.includes(bookingRestrictionModeStr as BookingRestrictionMode)) redirect("/venue?profileError=format");
  const bookingRestrictionMode = bookingRestrictionModeStr as BookingRestrictionMode;

  const restrictionHoursBefore = optInt(formData, "restrictionHoursBefore") ?? venue.restrictionHoursBefore ?? 6;
  const onPremiseMaxDistanceMeters =
    optInt(formData, "onPremiseMaxDistanceMeters") ?? venue.onPremiseMaxDistanceMeters ?? 1000;

  const templatePayload = {
    title,
    startTimeMin,
    endTimeMin,
    slotMinutes,
    breakMinutes,
    timeZone,
    isPublic: true,
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
      seriesStartDate,
      seriesEndDate,
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
  const performanceFormat = parsePerformanceFormat(reqString(formData, "performanceFormat"));

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
      performanceFormat,
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

export async function generateDateSchedule(formData: FormData) {
  const session = await requireVenueSession();
  const templateId = reqString(formData, "templateId");
  const date = reqDate(formData, "date");

  const template = await requirePrisma().eventTemplate.findUnique({
    where: { id: templateId },
    include: { venue: true },
  });
  if (!template) redirect("/venue?scheduleError=templateMissing");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(template.venueId)) redirect("/venue?venueError=forbidden");

  if (!isDateInSeriesRange(template.venue, date)) {
    redirect("/venue?scheduleError=outsideSeries");
  }

  const instance =
    (await requirePrisma().eventInstance.findUnique({
      where: { templateId_date: { templateId: template.id, date } },
    })) ??
    (await requirePrisma().eventInstance.create({
      data: { templateId: template.id, date },
    }));

  const slots = generateSlotsForWindow({
    startTimeMin: template.startTimeMin,
    endTimeMin: template.endTimeMin,
    slotMinutes: template.slotMinutes,
    breakMinutes: template.breakMinutes,
  });

  if (!instance.isCancelled) {
    await requirePrisma().$transaction(async (tx) => {
      await syncSlotsForInstance(tx, instance.id, slots);
    });
  }

  revalidatePath("/venue");
  revalidatePath(`/venues/${template.venue.slug}`);
  redirect("/venue?scheduleSuccess=date");
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
        data: { status: "RESERVED" },
      });
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

