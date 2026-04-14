import type { PrismaClient } from "@/generated/prisma/client";
import type { LineupTemplate } from "@/lib/venuePublicLineupData";
import { isDateInSeriesRange, isWithinBookingWindow } from "@/lib/venueBookingRules";
import { pickPrimaryLineup, storageYmdUtc } from "@/lib/venuePublicLineup";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import type { OpenMicMapVenueDto } from "@/lib/map/openMicMapTypes";

function cutoffForMapInstances(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 10);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function loadOpenMicMapVenues(prisma: PrismaClient): Promise<OpenMicMapVenueDto[]> {
  const cutoff = cutoffForMapInstances();
  const now = new Date();

  const rows = await prisma.venue.findMany({
    where: {
      lat: { not: null },
      lng: { not: null },
      eventTemplates: { some: { isPublic: true } },
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
    if (v.eventTemplates.length === 0) continue;

    const templatesForPick = v.eventTemplates as unknown as LineupTemplate[];
    const primary = pickPrimaryLineup(templatesForPick, v.timeZone, now);

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
      nextEvent,
      acceptingSignups,
    });
  }

  return out;
}
