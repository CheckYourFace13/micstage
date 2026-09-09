/**
 * Provision host-owned EventTemplate + EventInstance + slots for a PromoterNight.
 * Each host night gets its own template — isolates lineup/signup at same venue+date.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { BookingRestrictionMode, Weekday } from "@/generated/prisma/client";
import { isValidScheduleWindow, resolveScheduleEndMin } from "@/lib/scheduleWindow";
import { generateSlotsForWindow } from "@/lib/slotGeneration";
import { slotMayBeDeleted, syncSlotsForInstance } from "@/lib/slotSync";

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as unknown as Weekday[];

function weekdayFromDateUtc(d: Date): Weekday {
  return WEEKDAYS[d.getUTCDay()]!;
}

export type HostNightProvisionInput = {
  signupEnabled?: boolean;
  startTimeMin?: number;
  endTimeMin?: number;
  slotMinutes?: number;
  breakMinutes?: number;
};

export async function provisionHostNightLineup(
  prisma: PrismaClient,
  nightId: string,
  overrides?: HostNightProvisionInput,
): Promise<{ templateId: string; instanceId: string }> {
  const night = await prisma.promoterNight.findUnique({
    where: { id: nightId },
    include: {
      series: { select: { name: true, artistRules: true } },
      venue: { select: { id: true, timeZone: true } },
    },
  });
  if (!night) throw new Error("night_not_found");

  const signupEnabled = overrides?.signupEnabled ?? night.signupEnabled;
  const startTimeMin = overrides?.startTimeMin ?? night.startTimeMin;
  // End at or before start means the night runs past midnight (9:00 PM → 1:00 AM).
  const requestedEndTimeMin = overrides?.endTimeMin ?? night.endTimeMin;
  const endTimeMin = resolveScheduleEndMin(startTimeMin, requestedEndTimeMin);
  if (!isValidScheduleWindow(startTimeMin, endTimeMin)) throw new Error("invalid_schedule_window");
  const slotMinutes = overrides?.slotMinutes ?? night.slotMinutes;
  const breakMinutes = overrides?.breakMinutes ?? night.breakMinutes;
  const artistRules = night.series.artistRules?.trim() || null;

  await prisma.promoterNight.update({
    where: { id: nightId },
    data: { signupEnabled, startTimeMin, endTimeMin, slotMinutes, breakMinutes },
  });

  const title = night.title?.trim() || night.series.name;
  const weekday = weekdayFromDateUtc(night.date);
  const bookingMode = signupEnabled ? BookingRestrictionMode.NONE : BookingRestrictionMode.HOUSE_ONLY;

  let templateId: string;
  const existingTemplate = await prisma.eventTemplate.findUnique({
    where: { promoterNightId: nightId },
    select: { id: true },
  });

  if (existingTemplate) {
    templateId = existingTemplate.id;
    await prisma.eventTemplate.update({
      where: { id: templateId },
      data: {
        // The template follows the night, so a venue move carries the lineup with it.
        venueId: night.venueId,
        title,
        // Series artist rules ride on the template so every public lineup surface shows them.
        description: artistRules,
        weekday,
        startTimeMin,
        endTimeMin,
        slotMinutes,
        breakMinutes,
        bookingRestrictionMode: bookingMode,
        isPublic: true,
        timeZone: night.venue.timeZone,
      },
    });
  } else {
    const created = await prisma.eventTemplate.create({
      data: {
        venueId: night.venueId,
        promoterNightId: nightId,
        title,
        description: artistRules,
        weekday,
        startTimeMin,
        endTimeMin,
        slotMinutes,
        breakMinutes,
        bookingRestrictionMode: bookingMode,
        isPublic: true,
        timeZone: night.venue.timeZone,
      },
    });
    templateId = created.id;
  }

  let instance = await prisma.eventInstance.findUnique({
    where: { templateId_date: { templateId, date: night.date } },
    select: { id: true },
  });

  if (!instance) {
    instance = await prisma.eventInstance.create({
      data: { templateId, date: night.date },
      select: { id: true },
    });
  }

  const desired = generateSlotsForWindow({ startTimeMin, endTimeMin, slotMinutes, breakMinutes });
  await syncSlotsForInstance(prisma, instance.id, desired);

  // A host night owns exactly one dated instance; drop untouched leftovers after a date change.
  const stale = await prisma.eventInstance.findMany({
    where: { templateId, date: { not: night.date } },
    include: { slots: { include: { booking: true } } },
  });
  for (const inst of stale) {
    if (inst.slots.every((s) => slotMayBeDeleted(s))) {
      await prisma.eventInstance.delete({ where: { id: inst.id } });
    }
  }

  return { templateId, instanceId: instance.id };
}

export function publicLineupPathForNightId(nightId: string): string {
  return `/nights/${nightId}/lineup`;
}

export async function publicLineupHrefForNight(
  prisma: PrismaClient,
  nightId: string,
): Promise<string | null> {
  const night = await prisma.promoterNight.findUnique({
    where: { id: nightId },
    select: { id: true, eventTemplate: { select: { id: true } } },
  });
  if (!night) return null;
  if (!night.eventTemplate) {
    try {
      await provisionHostNightLineup(prisma, nightId);
    } catch {
      return null;
    }
  }
  return publicLineupPathForNightId(nightId);
}
