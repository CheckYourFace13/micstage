"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { generateSlotsForWindow } from "@/lib/slotGeneration";
import { bookingBlockReason, isDateInSeriesRange } from "@/lib/venueBookingRules";
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

function timeToMinutes(time: string, field: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`${field} must be HH:MM`);
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) throw new Error(`${field} is invalid`);
  return hh * 60 + mm;
}

export async function createEventTemplate(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");

  const title = reqString(formData, "title");
  const weekday = reqString(formData, "weekday") as Weekday;
  const startTimeMin = timeToMinutes(reqString(formData, "startTime"), "startTime");
  const endTimeMin = timeToMinutes(reqString(formData, "endTime"), "endTime");
  if (endTimeMin <= startTimeMin) throw new Error("End time must be after start time");

  const slotMinutes = reqInt(formData, "slotMinutes");
  const breakMinutes = reqInt(formData, "breakMinutes");
  const seriesStartDate = reqDate(formData, "seriesStartDate");
  const seriesEndDate = reqDate(formData, "seriesEndDate");
  if (seriesEndDate.getTime() < seriesStartDate.getTime()) {
    redirect("/venue?profileError=badRange");
  }

  const venue = await prisma.venue.findUnique({
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
}

export async function updateVenueProfile(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");

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

  await prisma.venue.update({
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
  const v = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
}

export async function discoverVenueSocials(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { websiteUrl: true, slug: true },
  });
  const website = venue?.websiteUrl;
  if (!website) redirect("/venue?profileError=missingWebsite");

  let html = "";
  try {
    const res = await fetch(website, { redirect: "follow", cache: "no-store" });
    if (!res.ok) redirect("/venue?profileError=socialFetchFailed");
    html = await res.text();
  } catch {
    redirect("/venue?profileError=socialFetchFailed");
  }

  const links = Array.from(html.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map((m) => m[0]);
  const facebookUrl = firstMatchingLink(links, [/facebook\.com\//i]);
  const instagramUrl = firstMatchingLink(links, [/instagram\.com\//i]);
  const twitterUrl = firstMatchingLink(links, [/twitter\.com\//i, /x\.com\//i]);
  const tiktokUrl = firstMatchingLink(links, [/tiktok\.com\//i]);
  const youtubeUrl = firstMatchingLink(links, [/youtube\.com\//i, /youtu\.be\//i]);
  const soundcloudUrl = firstMatchingLink(links, [/soundcloud\.com\//i]);

  await prisma.venue.update({
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
  redirect("/venue?profileError=socialFound");
}

export async function generateDateSchedule(formData: FormData) {
  const session = await requireVenueSession();
  const templateId = reqString(formData, "templateId");
  const date = reqDate(formData, "date");

  const template = await prisma.eventTemplate.findUnique({
    where: { id: templateId },
    include: { venue: true },
  });
  if (!template) throw new Error("Template not found");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(template.venueId)) throw new Error("Not allowed");

  if (!isDateInSeriesRange(template.venue, date)) {
    redirect("/venue?scheduleError=outsideSeries");
  }

  const instance =
    (await prisma.eventInstance.findUnique({
      where: { templateId_date: { templateId: template.id, date } },
    })) ??
    (await prisma.eventInstance.create({
      data: { templateId: template.id, date },
    }));

  const slots = generateSlotsForWindow({
    startTimeMin: template.startTimeMin,
    endTimeMin: template.endTimeMin,
    slotMinutes: template.slotMinutes,
    breakMinutes: template.breakMinutes,
  });

  await prisma.$transaction(
    slots.map((s) =>
      prisma.slot.upsert({
        where: { instanceId_startMin: { instanceId: instance.id, startMin: s.startMin } },
        update: { endMin: s.endMin, status: "AVAILABLE" },
        create: { instanceId: instance.id, startMin: s.startMin, endMin: s.endMin, status: "AVAILABLE" },
      }),
    ),
  );

  revalidatePath("/venue");
  revalidatePath(`/venues/${template.venue.slug}`);
}

export async function inviteManager(formData: FormData) {
  const session = await requireVenueSession();
  if (!session.venueOwnerId) throw new Error("Only admins can invite managers (for now)");

  const venueId = reqString(formData, "venueId");
  const managerEmail = reqString(formData, "managerEmail").toLowerCase();
  const tempPassword = reqString(formData, "tempPassword");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");

  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.$transaction(async (tx) => {
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
}

export async function houseBookSlot(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const slotId = reqString(formData, "slotId");
  const performerName = reqString(formData, "performerName");

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");

  await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      include: {
        booking: true,
        instance: { include: { template: { include: { venue: true } } } },
      },
    });
    if (!slot) throw new Error("Slot not found");
    if (slot.instance.template.venueId !== venueId) throw new Error("Venue mismatch");

    const instanceVenue = slot.instance.template.venue;
    const instanceBlock = bookingBlockReason(instanceVenue, slot.instance.date);
    if (instanceBlock) throw new Error(instanceBlock);

    const slotStartUtc = new Date(slot.instance.date.getTime() + slot.startMin * 60 * 1000);
    if (slotStartUtc.getTime() <= Date.now()) throw new Error("This slot has already started.");

    if (slot.booking && !slot.booking.cancelledAt) {
      throw new Error("Slot already booked");
    }

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

  revalidatePath("/venue");
  const v = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
}

export async function upgradeVenuePlan(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = reqString(formData, "venueId");
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) throw new Error("Not allowed");
  if (!session.venueOwnerId) throw new Error("Only venue owners can change plan (for now)");

  // Placeholder: real payment integration (Stripe/etc.) is not wired yet.
  // To avoid accidental production “free upgrades”, only allow manual upgrades in dev.
  if (process.env.NODE_ENV === "production") {
    redirect("/venue?planError=paymentsDisabled");
  }

  await prisma.venue.update({
    where: { id: venueId },
    data: { subscriptionTier: "PRO" },
  });

  revalidatePath("/venue");
  const v = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  if (v?.slug) revalidatePath(`/venues/${v.slug}`);
}

