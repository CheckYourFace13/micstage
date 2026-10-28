import type { PrismaClient, Weekday } from "@/generated/prisma/client";
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
      schedules: { some: { isActive: true } },
    },
    select: {
      slug: true,
      name: true,
      city: true,
      region: true,
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
    take: 80,
  });

  const scored = rows
    .filter((r) => isPublicListingNameOk(r.name) && Boolean(r.city?.trim()))
    .map((r) => {
      const confirmed = r.schedules.filter((s) => scheduleTimesArePubliclyConfirmed(s));
      const days = [...new Set(confirmed.map((s) => s.weekday))].sort(
        (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
      );
      const scheduleLabel =
        days.length === 0
          ? null
          : days.length === 1
            ? `${weekdayToLabel(days[0]!)}s`
            : days.map((d) => weekdayToLabel(d).slice(0, 3)).join(" · ");
      const format = confirmed.map((s) => s.performanceFormat).find(Boolean);
      return {
        slug: r.slug,
        name: r.name,
        city: r.city!.trim(),
        scheduleLabel,
        formatLabel: format ? performanceFormatLabel(format) : null,
        hasConfirmedSchedule: confirmed.length > 0,
        score: marketScore(r.city, r.region) + (confirmed.length > 0 ? 50 : 0),
      };
    })
    .filter((r) => r.hasConfirmedSchedule)
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
