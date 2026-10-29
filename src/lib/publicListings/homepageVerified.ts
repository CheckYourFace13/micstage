import type { PrismaClient, Weekday } from "@/generated/prisma/client";
import { listingDisplayCityRegion } from "@/lib/publicListings/evidenceTrust";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { scheduleTimesArePubliclyConfirmed } from "@/lib/publicListings/scheduleTimeSanity";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { weekdayToLabel } from "@/lib/time";

const PRIORITY_MARKET =
  /\b(chicago|new york|brooklyn|manhattan|los angeles|austin|nashville|denver|portland|seattle|atlanta|boston|philadelphia|houston|dallas|miami|minneapolis|detroit)\b/i;

function marketScore(city?: string | null, region?: string | null): number {
  const place = `${city ?? ""} ${region ?? ""}`.toLowerCase();
  if (/\bchicago\b/.test(place) || /\bil\b/.test(place) || /\billinois\b/.test(place)) return 100;
  if (PRIORITY_MARKET.test(place)) return 70;
  return 10;
}

export type HomepageVerifiedListing = {
  slug: string;
  name: string;
  city: string;
  scheduleLabel: string | null;
  formatLabel: string | null;
};

const WEEKDAY_ORDER: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const UNCONFIRMED_SCHEDULE_LABEL = "Schedule being confirmed";

export async function loadHomepageVerifiedOpenMics(
  prisma: PrismaClient,
  limit = 12,
): Promise<HomepageVerifiedListing[]> {
  const take = Math.min(12, Math.max(8, limit));
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      removedAt: null,
      claimedVenueId: null,
      city: { not: null },
    },
    select: {
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      lastVerifiedAt: true,
      schedules: {
        where: { isActive: true },
        select: {
          weekday: true,
          startTimeMin: true,
          description: true,
          performanceFormat: true,
        },
      },
    },
    orderBy: { lastVerifiedAt: "desc" },
    take: 200,
  });

  const scored = rows
    .filter((r) => isPublicListingNameOk(r.name) && Boolean(r.city?.trim()))
    .map((r) => {
      const place = listingDisplayCityRegion({
        name: r.name,
        city: r.city,
        region: r.region,
        formattedAddress: r.formattedAddress,
      });
      const confirmed = r.schedules.filter((s) => scheduleTimesArePubliclyConfirmed(s));
      const days = [...new Set(confirmed.map((s) => s.weekday))].sort(
        (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
      );
      const scheduleLabel =
        days.length === 0
          ? UNCONFIRMED_SCHEDULE_LABEL
          : days.length === 1
            ? `${weekdayToLabel(days[0]!)}s`
            : days.map((d) => weekdayToLabel(d).slice(0, 3)).join(" · ");
      const format = confirmed.map((s) => s.performanceFormat).find(Boolean);
      const hasConfirmedSchedule = confirmed.length > 0;
      return {
        slug: r.slug,
        name: r.name,
        city: (place.city || r.city || "").trim(),
        scheduleLabel,
        formatLabel: format ? performanceFormatLabel(format) : null,
        hasConfirmedSchedule,
        hasAnySchedule: r.schedules.length > 0,
        score:
          marketScore(place.city, place.region) +
          (hasConfirmedSchedule ? 80 : r.schedules.length > 0 ? 20 : 0),
      };
    })
    .filter((r) => Boolean(r.city))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, take);

  return scored.map(({ slug, name, city, scheduleLabel, formatLabel }) => ({
    slug,
    name,
    city,
    scheduleLabel,
    formatLabel,
  }));
}
