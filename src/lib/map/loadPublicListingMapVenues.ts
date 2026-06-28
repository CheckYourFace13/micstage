import type { PrismaClient, Weekday } from "@/generated/prisma/client";
import type { OpenMicMapVenueDto } from "@/lib/map/openMicMapTypes";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { loadDiscoverablePublicListings } from "@/lib/publicListings/queries";
import { discoveryBadgeLabel, listingPublicHref } from "@/lib/publicListings/types";

function uniqueWeekdays(schedules: { weekday: Weekday }[]): Weekday[] {
  const seen = new Set<Weekday>();
  const out: Weekday[] = [];
  for (const s of schedules) {
    if (!seen.has(s.weekday)) {
      seen.add(s.weekday);
      out.push(s.weekday);
    }
  }
  return out;
}

/** Public verified listings with coordinates for the open mic map. */
export async function loadPublicListingMapVenues(prisma: PrismaClient): Promise<OpenMicMapVenueDto[]> {
  const listings = await loadDiscoverablePublicListings(prisma);
  const rows: OpenMicMapVenueDto[] = [];

  for (const l of listings) {
    if (l.lat == null || l.lng == null || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue;
    const weekdays = uniqueWeekdays(l.schedules);
    const templates = l.schedules.map((s) => ({
      id: s.id,
      title: s.title ?? `${weekdayToLabel(s.weekday)} open mic`,
      weekday: s.weekday,
      startTimeMin: s.startTimeMin,
      endTimeMin: s.endTimeMin,
      performanceFormat: s.performanceFormat,
      bookingRestrictionMode: "NONE",
    }));

    const first = l.schedules[0];
    const hasSchedule = l.schedules.length > 0;
    rows.push({
      slug: l.slug,
      href: listingPublicHref(l.slug),
      isPublicListing: true,
      name: l.name,
      city: l.city,
      region: l.region,
      lat: l.lat,
      lng: l.lng,
      timeZone: l.timeZone,
      templates,
      weekdays,
      performanceFormats: [...new Set(l.schedules.map((s) => s.performanceFormat))],
      hasPublicSchedule: hasSchedule,
      mapKind: l.verificationStatus === "VERIFIED" || l.verificationStatus === "NEEDS_REVIEW" ? "verified" : "unclaimed",
      badgeLabel: discoveryBadgeLabel(
        l.verificationStatus === "VERIFIED" || l.verificationStatus === "NEEDS_REVIEW" ? "verified" : "unclaimed",
        false,
        { hasSchedule },
      ),
      nextEvent: first
        ? {
            ymd: "",
            templateTitle: first.title ?? listingPublicHref(l.slug),
            weekday: first.weekday,
            timeLabel: `${weekdayToLabel(first.weekday)} · ${minutesToTimeLabel(first.startTimeMin)}`,
            badge: "upcoming",
          }
        : null,
      acceptingSignups: false,
    });
  }

  return rows;
}

export async function loadMergedOpenMicMapVenues(prisma: PrismaClient): Promise<OpenMicMapVenueDto[]> {
  const { loadOpenMicMapVenues } = await import("@/lib/map/loadOpenMicMapVenues");
  const [claimed, listings] = await Promise.all([
    loadOpenMicMapVenues(prisma),
    loadPublicListingMapVenues(prisma),
  ]);

  const claimedWithHref = claimed.map((v) => ({
    ...v,
    href: v.href ?? `/venues/${v.slug}`,
    isPublicListing: v.isPublicListing ?? false,
  }));

  return [...claimedWithHref, ...listings].sort((a, b) => a.name.localeCompare(b.name));
}
