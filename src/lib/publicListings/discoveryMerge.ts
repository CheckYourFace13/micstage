import type { PrismaClient } from "@/generated/prisma/client";
import {
  computeCitySlugVenueCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
  venueIncludedInDiscoveryPage,
} from "@/lib/discoveryMarket";
import { formatMiles, haversineDistanceMiles } from "@/lib/geo";
import { loadDiscoverablePublicListings } from "@/lib/publicListings/queries";
import { dedupeByPublicDiscoveryIdentity } from "@/lib/publicListings/publicDiscoveryIdentity";
import type {
  DiscoveryListingKind,
  NearbyDiscoveryRow,
  OpenMicFinderVenue,
} from "@/lib/publicListings/types";
import {
  discoveryBadgeLabel,
  listingPublicHref,
  venuePublicHref,
} from "@/lib/publicListings/types";
import { listingDisplayCityRegion, listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";

export type PublicDiscoveryLocationRow = {
  key: string;
  label: string;
  count: number;
  slug: string;
};

type CityRegionRow = {
  city: string | null;
  region: string | null;
  name?: string;
  googlePlaceId?: string | null;
};

function listingKind(verificationStatus: string): DiscoveryListingKind {
  if (verificationStatus === "VERIFIED" || verificationStatus === "NEEDS_REVIEW") return "verified";
  return "unclaimed";
}

/** Avoid showing "Name, City, ST" under an H1 that already shows Name. */
export function displayListingAddress(
  name: string,
  formattedAddress: string | null | undefined,
  city: string | null | undefined,
  region: string | null | undefined,
): string {
  const place = [city, region].filter(Boolean).join(", ").trim();
  const addr = (formattedAddress ?? "").trim();
  if (!addr) return place;
  const nameNorm = name.trim().toLowerCase();
  if (nameNorm && addr.toLowerCase().startsWith(nameNorm)) {
    const rest = addr.slice(name.length).replace(/^[\s,]+/, "").trim();
    if (rest) return rest;
    return place;
  }
  if (place && addr.toLowerCase() === `${nameNorm}, ${place.toLowerCase()}`) return place;
  return addr;
}

function toFinderRow(
  base: {
    slug: string;
    name: string;
    city: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
  },
  opts: {
    href: string;
    kind: DiscoveryListingKind;
    bookable: boolean;
    hasSchedule?: boolean;
    scheduleWeekdays?: string[];
    performanceFormats?: string[];
    signupMethod?: string | null;
    cost?: string | null;
    scheduleStarts?: Array<{ weekday: string; startTimeMin: number }>;
    ctaLabel?: string | null;
  },
  counts: ReadonlyMap<string, number>,
): OpenMicFinderVenue {
  const displayed = listingDisplayCityRegion({
    name: base.name,
    city: base.city,
    region: base.region,
  });
  const city = (displayed.city ?? "").trim();
  const region = displayed.region ?? base.region;
  const discoverySlug = city ? primaryDiscoverySlugForVenue(city, region, counts) || null : null;
  return {
    slug: base.slug,
    href: opts.href,
    kind: opts.kind,
    bookable: opts.bookable,
    hasSchedule: opts.hasSchedule ?? true,
    badgeLabel: discoveryBadgeLabel(opts.kind, opts.bookable, { hasSchedule: opts.hasSchedule }),
    ctaLabel: opts.ctaLabel ?? null,
    name: base.name,
    city: displayed.city ?? base.city,
    region,
    lat: base.lat,
    lng: base.lng,
    discoverySlug,
    scheduleWeekdays: opts.scheduleWeekdays,
    performanceFormats: opts.performanceFormats,
    signupMethod: opts.signupMethod ?? null,
    cost: opts.cost ?? null,
    scheduleStarts: opts.scheduleStarts,
  };
}

/**
 * One row per venue/open-mic identity for market rollups and /locations counts.
 * Uses the same discoverable listing gate + identity dedupe as finder/hubs.
 */
async function combinedCityRegionRows(prisma: PrismaClient): Promise<CityRegionRow[]> {
  const [venues, listings] = await Promise.all([
    prisma.venue.findMany({
      where: { city: { not: null } },
      select: { name: true, city: true, region: true, googlePlaceId: true },
    }),
    // Same public gate as finder (name + geo + trusted open-mic evidence).
    loadDiscoverablePublicListings(prisma),
  ]);
  // Claimed venues first so they win identity ties against unclaimed listing mirrors.
  const merged = [
    ...venues.map((v) => ({ ...v, _kind: "claimed" as const })),
    ...listings.map((l) => ({
      name: l.name,
      city: l.city,
      region: l.region,
      googlePlaceId: l.googlePlaceId,
      _kind: "verified" as const,
    })),
  ];
  return dedupeByPublicDiscoveryIdentity(
    merged,
    (r) => ({ googlePlaceId: r.googlePlaceId, name: r.name, city: r.city, region: r.region }),
    (r) => ({ kind: r._kind }),
  ).map((r) => ({ city: r.city, region: r.region, name: r.name, googlePlaceId: r.googlePlaceId }));
}

export async function getDiscoveryLocationCounts(prisma: PrismaClient): Promise<Map<string, number>> {
  const rows = await combinedCityRegionRows(prisma);
  return computeCitySlugVenueCounts(rows);
}

export async function loadPublicDiscoveryLocationRows(prisma: PrismaClient): Promise<PublicDiscoveryLocationRow[]> {
  const rows = await combinedCityRegionRows(prisma);
  const counts = computeCitySlugVenueCounts(rows);
  const byDiscovery = new Map<string, { label: string; count: number }>();

  for (const v of rows) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const slug = primaryDiscoverySlugForVenue(city, v.region, counts);
    if (!slug) continue;
    const cur = byDiscovery.get(slug);
    if (!cur) {
      const rollup = rollupDiscoveryLabel(slug);
      const label = rollup ?? (v.region?.trim() ? `${city}, ${v.region.trim()}` : city);
      byDiscovery.set(slug, { label, count: 0 });
    }
    byDiscovery.get(slug)!.count += 1;
  }

  return [...byDiscovery.entries()]
    .map(([slug, v]) => ({
      key: slug,
      label: v.label,
      count: v.count,
      slug,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadOpenMicFinderVenues(prisma: PrismaClient): Promise<OpenMicFinderVenue[]> {
  const [venues, listings, counts, hostSignupNights] = await Promise.all([
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        region: true,
        lat: true,
        lng: true,
        googlePlaceId: true,
        bookingOpensDaysAhead: true,
        eventTemplates: {
          where: { isPublic: true },
          select: { id: true, bookingRestrictionMode: true, weekday: true, performanceFormat: true, startTimeMin: true },
          take: 8,
        },
      },
    }),
    loadDiscoverablePublicListings(prisma),
    getDiscoveryLocationCounts(prisma),
    // Upcoming Host nights with signup on — used to deep-link performers to the night page.
    prisma.promoterNight.findMany({
      where: {
        signupEnabled: true,
        date: { gte: new Date(Date.now() - 12 * 3600_000) },
        eventTemplate: { isPublic: true, bookingRestrictionMode: { not: "HOUSE_ONLY" } },
      },
      select: {
        id: true,
        venueId: true,
        date: true,
        eventTemplate: {
          select: {
            instances: {
              where: { isCancelled: false },
              select: {
                date: true,
                slots: {
                  where: { status: "AVAILABLE" },
                  select: { id: true, booking: { select: { cancelledAt: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
      take: 400,
    }),
  ]);

  const nextHostSignupByVenue = new Map<string, { nightId: string; openSpots: number }>();
  for (const night of hostSignupNights) {
    if (nextHostSignupByVenue.has(night.venueId)) continue;
    const nightYmd = night.date.toISOString().slice(0, 10);
    const instance =
      night.eventTemplate?.instances.find((i) => i.date.toISOString().slice(0, 10) === nightYmd) ?? null;
    const openSpots =
      instance?.slots.filter((s) => !(s.booking && s.booking.cancelledAt == null)).length ?? 0;
    nextHostSignupByVenue.set(night.venueId, { nightId: night.id, openSpots });
  }

  type FinderWithPlace = { row: OpenMicFinderVenue; googlePlaceId: string | null };

  const claimed: FinderWithPlace[] = venues.map((v) => {
    const hasSchedule = v.eventTemplates.length > 0;
    const hostSignup = nextHostSignupByVenue.get(v.id);
    const bookable =
      (hasSchedule &&
        (v.bookingOpensDaysAhead ?? 0) > 0 &&
        v.eventTemplates.some((t) => t.bookingRestrictionMode !== "HOUSE_ONLY")) ||
      Boolean(hostSignup);
    const scheduleWeekdays = [...new Set(v.eventTemplates.map((t) => t.weekday))];
    const scheduleStarts = v.eventTemplates.map((t) => ({ weekday: t.weekday, startTimeMin: t.startTimeMin }));
    const performanceFormats = [...new Set(v.eventTemplates.map((t) => t.performanceFormat).filter(Boolean))];
    const href = hostSignup ? `/nights/${hostSignup.nightId}/lineup` : venuePublicHref(v.slug);
    const ctaLabel = hostSignup
      ? hostSignup.openSpots > 0
        ? `OPEN SPOTS · Sign up →`
        : "Sign up for this night →"
      : null;
    return {
      row: toFinderRow(
        v,
        {
          href,
          kind: "claimed",
          bookable,
          hasSchedule,
          scheduleWeekdays,
          scheduleStarts,
          performanceFormats,
          ctaLabel,
        },
        counts,
      ),
      googlePlaceId: v.googlePlaceId ?? null,
    };
  });

  const unclaimed: FinderWithPlace[] = listings.map((l) => {
    const kind = listingKind(l.verificationStatus);
    const hasSchedule = l.schedules.length > 0;
    const scheduleWeekdays = [...new Set(l.schedules.map((s) => s.weekday))];
    const scheduleStarts = l.schedules
      .filter((s) => !String(s.description ?? "").startsWith("TIME_UNCONFIRMED"))
      .map((s) => ({ weekday: s.weekday, startTimeMin: s.startTimeMin }));
    const performanceFormats = [
      ...new Set(l.schedules.map((s) => s.performanceFormat).filter(Boolean) as string[]),
    ];
    return {
      row: toFinderRow(
        l,
        {
          href: listingPublicHref(l.slug),
          kind,
          bookable: false,
          hasSchedule,
          scheduleWeekdays,
          scheduleStarts,
          performanceFormats,
          signupMethod: l.signupMethod,
          cost: l.cost,
        },
        counts,
      ),
      googlePlaceId: l.googlePlaceId ?? null,
    };
  });

  const deduped = dedupeByPublicDiscoveryIdentity(
    [...claimed, ...unclaimed],
    (r) => ({
      googlePlaceId: r.googlePlaceId,
      name: r.row.name,
      city: r.row.city,
      region: r.row.region,
    }),
    (r) => ({
      kind: r.row.kind,
      bookable: r.row.bookable,
      hasSchedule: r.row.hasSchedule,
    }),
  ).map((r) => r.row);

  return deduped.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadNearbyDiscoveryRows(
  prisma: PrismaClient,
  lat: number,
  lng: number,
): Promise<NearbyDiscoveryRow[]> {
  // Reuse deduped finder inventory so nearby matches hub/finder identity counts.
  const finder = await loadOpenMicFinderVenues(prisma);

  const [venues, listings] = await Promise.all([
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: {
        slug: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        lat: true,
        lng: true,
      },
    }),
    loadDiscoverablePublicListings(prisma),
  ]);

  const withDist: NearbyDiscoveryRow[] = [];
  const noCoord: NearbyDiscoveryRow[] = [];

  type Raw = {
    slug: string;
    name: string;
    city: string | null;
    region: string | null;
    formattedAddress: string;
    lat: number | null;
    lng: number | null;
    href: string;
    kind: DiscoveryListingKind;
    bookable: boolean;
    hasSchedule?: boolean;
    ctaLabel?: string | null;
  };

  const venueBySlug = new Map(venues.map((v) => [v.slug, v]));
  const listingBySlug = new Map(listings.map((l) => [l.slug, l]));

  const rows: Raw[] = finder.map((f) => {
    const v = venueBySlug.get(f.slug);
    const l = listingBySlug.get(f.slug);
    return {
      slug: f.slug,
      name: f.name,
      city: f.city,
      region: f.region,
      formattedAddress: v
        ? v.formattedAddress
        : l
          ? displayListingAddress(l.name, l.formattedAddress, l.city, l.region)
          : [f.city, f.region].filter(Boolean).join(", "),
      lat: f.lat ?? v?.lat ?? l?.lat ?? null,
      lng: f.lng ?? v?.lng ?? l?.lng ?? null,
      href: f.href,
      kind: f.kind,
      bookable: f.bookable,
      hasSchedule: f.hasSchedule,
      ctaLabel: f.ctaLabel ?? null,
    };
  });

  for (const v of rows) {
    const base = {
      slug: v.slug,
      href: v.href,
      kind: v.kind,
      bookable: v.bookable,
      hasSchedule: "hasSchedule" in v ? Boolean(v.hasSchedule) : true,
      badgeLabel: discoveryBadgeLabel(v.kind, v.bookable, {
        hasSchedule: "hasSchedule" in v ? Boolean(v.hasSchedule) : true,
      }),
      ctaLabel: v.ctaLabel ?? null,
      name: v.name,
      city: v.city,
      region: v.region,
      formattedAddress: v.formattedAddress,
    };
    if (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
      const d = haversineDistanceMiles(lat, lng, v.lat, v.lng);
      withDist.push({ ...base, distanceMiles: d, distanceLabel: formatMiles(d) });
    } else {
      noCoord.push({ ...base, distanceMiles: null, distanceLabel: "—" });
    }
  }

  withDist.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  noCoord.sort((a, b) => a.name.localeCompare(b.name));
  return [...withDist, ...noCoord];
}

/** Claimed venues + public listings for a discovery market slug (e.g. chicago-il). */
export async function loadDiscoveryMarketOpenMics(
  prisma: PrismaClient,
  locationSlug: string,
): Promise<OpenMicFinderVenue[]> {
  const counts = await getDiscoveryLocationCounts(prisma);
  const all = await loadOpenMicFinderVenues(prisma);
  return all
    .filter((row) => {
      const city = (row.city ?? "").trim();
      if (!city) return false;
      if (
        listingHasGeoConflict({
          name: row.name,
          city: row.city,
          region: row.region,
          formattedAddress: null,
        })
      ) {
        return false;
      }
      return venueIncludedInDiscoveryPage({ city, region: row.region }, locationSlug, counts);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
