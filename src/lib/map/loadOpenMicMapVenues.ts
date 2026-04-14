import type { PrismaClient } from "@/generated/prisma/client";
import type { LineupTemplate } from "@/lib/venuePublicLineupData";
import { isDateInSeriesRange, isWithinBookingWindow } from "@/lib/venueBookingRules";
import { pickPrimaryLineup, storageYmdUtc } from "@/lib/venuePublicLineup";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import type { OpenMicMapVenueDto } from "@/lib/map/openMicMapTypes";

const MAP_ACTIVE_WINDOW_DAYS = 120;

function cutoffForMapActivity(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - MAP_ACTIVE_WINDOW_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function cutoffForMapInstances(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 10);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function loadOpenMicMapVenues(prisma: PrismaClient): Promise<OpenMicMapVenueDto[]> {
  const activeCutoff = cutoffForMapActivity();
  const cutoff = cutoffForMapInstances();
  const now = new Date();

  const rows = await prisma.venue.findMany({
    where: {
      lat: { not: null },
      lng: { not: null },
      OR: [
        // Account-level activity proxy (no persisted login timestamp exists yet).
        { updatedAt: { gte: activeCutoff } },
        { owner: { updatedAt: { gte: activeCutoff } } },
        { managerAccess: { some: { manager: { updatedAt: { gte: activeCutoff } } } } },
        // Open mic / schedule / booking activity.
        {
          eventTemplates: {
            some: {
              OR: [
                { createdAt: { gte: activeCutoff } },
                { updatedAt: { gte: activeCutoff } },
                {
                  instances: {
                    some: {
                      OR: [
                        { createdAt: { gte: activeCutoff } },
                        { updatedAt: { gte: activeCutoff } },
                        { date: { gte: activeCutoff } },
                        {
                          slots: {
                            some: {
                              OR: [
                                { createdAt: { gte: activeCutoff } },
                                { updatedAt: { gte: activeCutoff } },
                                { booking: { is: { updatedAt: { gte: activeCutoff } } } },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
        // Messaging activity.
        {
          messageThreads: {
            some: {
              OR: [
                { updatedAt: { gte: activeCutoff } },
                { lastMessageAt: { gte: activeCutoff } },
                { messages: { some: { createdAt: { gte: activeCutoff } } } },
              ],
            },
          },
        },
      ],
    },
    orderBy: [{ name: "asc" }],
    select: {
      slug: true,
      name: true,
      city: true,
      region: true,
      lat: true,
      lng: true,
      timeZone: true,
      seriesStartDate: true,
      seriesEndDate: true,
      bookingOpensDaysAhead: true,
      eventTemplates: {
        where: { isPublic: true },
        orderBy: [{ weekday: "asc" }, { startTimeMin: "asc" }],
        select: {
          id: true,
          title: true,
          weekday: true,
          startTimeMin: true,
          endTimeMin: true,
          performanceFormat: true,
          timeZone: true,
          bookingRestrictionMode: true,
          instances: {
            where: { isCancelled: false, date: { gte: cutoff } },
            orderBy: { date: "asc" },
            take: 48,
            select: {
              date: true,
              isCancelled: true,
              slots: {
                select: {
                  startMin: true,
                  endMin: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const out: OpenMicMapVenueDto[] = [];

  for (const v of rows) {
    const lat = v.lat;
    const lng = v.lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const hasPublicSchedule = v.eventTemplates.length > 0;
    const templatesForPick = v.eventTemplates as unknown as LineupTemplate[];
    const primary = hasPublicSchedule ? pickPrimaryLineup(templatesForPick, v.timeZone, now) : null;

    let nextEvent: OpenMicMapVenueDto["nextEvent"] = null;
    if (primary) {
      const t = primary.template;
      nextEvent = {
        ymd: storageYmdUtc(primary.instance.date),
        templateTitle: t.title.trim() || "Open mic",
        weekday: t.weekday,
        timeLabel: `${weekdayToLabel(t.weekday)} · ${minutesToTimeLabel(t.startTimeMin)}–${minutesToTimeLabel(t.endTimeMin)}`,
        badge: primary.badge,
      };
    }

    const weekdays = [...new Set(v.eventTemplates.map((t) => t.weekday))];
    const performanceFormats = [...new Set(v.eventTemplates.map((t) => t.performanceFormat))];

    const venueSeries = {
      seriesStartDate: v.seriesStartDate,
      seriesEndDate: v.seriesEndDate,
      bookingOpensDaysAhead: v.bookingOpensDaysAhead,
      timeZone: v.timeZone,
    };

    let acceptingSignups = false;
    for (const t of v.eventTemplates) {
      if (t.bookingRestrictionMode === "HOUSE_ONLY") continue;
      for (const inst of t.instances) {
        if (inst.isCancelled) continue;
        if (!isDateInSeriesRange(venueSeries, inst.date)) continue;
        if (!isWithinBookingWindow(venueSeries, inst.date, now)) continue;
        if (inst.slots.some((s) => s.status === "AVAILABLE")) {
          acceptingSignups = true;
          break;
        }
      }
      if (acceptingSignups) break;
    }

    out.push({
      slug: v.slug,
      name: v.name,
      city: v.city,
      region: v.region,
      lat,
      lng,
      timeZone: v.timeZone,
      templates: v.eventTemplates.map((t) => ({
        id: t.id,
        title: t.title.trim() || "Open mic",
        weekday: t.weekday,
        startTimeMin: t.startTimeMin,
        endTimeMin: t.endTimeMin,
        performanceFormat: t.performanceFormat,
        bookingRestrictionMode: t.bookingRestrictionMode,
      })),
      weekdays,
      performanceFormats,
      hasPublicSchedule,
      nextEvent,
      acceptingSignups,
    });
  }

  return out;
}
