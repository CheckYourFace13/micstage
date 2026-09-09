import type { PrismaClient } from "@/generated/prisma/client";
import {
  computeCitySlugVenueCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
  venueIncludedInDiscoveryPage,
} from "@/lib/discoveryMarket";
import { formatMiles, haversineDistanceMiles } from "@/lib/geo";
import { loadDiscoverablePublicListings, publicListingWhereDiscoverable } from "@/lib/publicListings/queries";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
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

export type PublicDiscoveryLocationRow = {
  key: string;
  label: string;
  count: number;
  slug: string;
};

type CityRegionRow = { city: string | null; region: string | null };

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
    ctaLabel?: string | null;
  },
  counts: ReadonlyMap<string, number>,
): OpenMicFinderVenue {
  const city = (base.city ?? "").trim();
  const discoverySlug = city ? primaryDiscoverySlugForVenue(city, base.region, counts) || null : null;
  return {
    slug: base.slug,
    href: opts.href,
    kind: opts.kind,
    bookable: opts.bookable,
    hasSchedule: opts.hasSchedule ?? true,
    badgeLabel: discoveryBadgeLabel(opts.kind, opts.bookable, { hasSchedule: opts.hasSchedule }),
    ctaLabel: opts.ctaLabel ?? null,
    name: base.name,
    city: base.city,
    region: base.region,
    lat: base.lat,
    lng: base.lng,
    discoverySlug,
    scheduleWeekdays: opts.scheduleWeekdays,
    performanceFormats: opts.performanceFormats,
    signupMethod: opts.signupMethod ?? null,
  };
}

async function combinedCityRegionRows(prisma: PrismaClient): Promise<CityRegionRow[]> {
  const [venues, listings] = await Promise.all([
    prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    }),
    prisma.publicOpenMicListing.findMany({
      where: { city: { not: null }, ...publicListingWhereDiscoverable() },
      select: { name: true, city: true, region: true },
    }),
  ]);
  const qualityListings = listings
    .filter((l) => isPublicListingNameOk(l.name))
    .map((l) => ({ city: l.city, region: l.region }));
  return [...venues, ...qualityListings];
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
        bookingOpensDaysAhead: true,
        eventTemplates: {
          where: { isPublic: true },
          select: { id: true, bookingRestrictionMode: true, weekday: true, performanceFormat: true },
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

  const claimed = venues.map((v) => {
    const hasSchedule = v.eventTemplates.length > 0;
    const hostSignup = nextHostSignupByVenue.get(v.id);
    const bookable =
      (hasSchedule &&
        (v.bookingOpensDaysAhead ?? 0) > 0 &&
        v.eventTemplates.some((t) => t.bookingRestrictionMode !== "HOUSE_ONLY")) ||
      Boolean(hostSignup);
    const scheduleWeekdays = [...new Set(v.eventTemplates.map((t) => t.weekday))];
    const performanceFormats = [...new Set(v.eventTemplates.map((t) => t.performanceFormat).filter(Boolean))];
    const href = hostSignup ? `/nights/${hostSignup.nightId}/lineup` : venuePublicHref(v.slug);
    const ctaLabel = hostSignup
      ? hostSignup.openSpots > 0
        ? `OPEN SPOTS · Sign up →`
        : "Sign up for this night →"
      : null;
    return toFinderRow(
      v,
      {
        href,
        kind: "claimed",
        bookable,
        hasSchedule,
        scheduleWeekdays,
        performanceFormats,
        ctaLabel,
      },
      counts,
    );
  });

  const unclaimed = listings.map((l) => {
    const kind = listingKind(l.verificationStatus);
    const hasSchedule = l.schedules.length > 0;
    const scheduleWeekdays = [...new Set(l.schedules.map((s) => s.weekday))];
    const performanceFormats = [
      ...new Set(l.schedules.map((s) => s.performanceFormat).filter(Boolean) as string[]),
    ];
    return toFinderRow(
      l,
      {
        href: listingPublicHref(l.slug),
        kind,
        bookable: false,
        hasSchedule,
        scheduleWeekdays,
        performanceFormats,
        signupMethod: l.signupMethod,
      },
      counts,
    );
  });

  return [...claimed, ...unclaimed].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadNearbyDiscoveryRows(
  prisma: PrismaClient,
  lat: number,
  lng: number,
): Promise<NearbyDiscoveryRow[]> {
  // Reuse finder rows so host-night deep links and OPEN SPOTS CTAs stay consistent.
  const finder = await loadOpenMicFinderVenues(prisma);
  const bySlug = new Map(finder.map((v) => [v.slug, v]));

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

  const rows: Raw[] = [
    ...venues.map((v) => {
      const f = bySlug.get(v.slug);
      return {
        slug: v.slug,
        name: v.name,
        city: v.city,
        region: v.region,
        formattedAddress: v.formattedAddress,
        lat: v.lat,
        lng: v.lng,
        href: f?.href ?? venuePublicHref(v.slug),
        kind: "claimed" as const,
        bookable: f?.bookable ?? false,
        hasSchedule: f?.hasSchedule ?? true,
        ctaLabel: f?.ctaLabel ?? null,
      };
    }),
    ...listings.map((l) => ({
      slug: l.slug,
      name: l.name,
      city: l.city,
      region: l.region,
      formattedAddress: displayListingAddress(l.name, l.formattedAddress, l.city, l.region),
      lat: l.lat,
      lng: l.lng,
      href: listingPublicHref(l.slug),
      kind: listingKind(l.verificationStatus),
      bookable: false,
      hasSchedule: l.schedules.length > 0,
      ctaLabel: null,
    })),
  ];

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
      return venueIncludedInDiscoveryPage({ city, region: row.region }, locationSlug, counts);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
