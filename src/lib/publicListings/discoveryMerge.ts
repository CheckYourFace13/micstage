import type { PrismaClient } from "@/generated/prisma/client";
import {
  computeCitySlugVenueCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
  venueIncludedInDiscoveryPage,
} from "@/lib/discoveryMarket";
import { formatMiles, haversineDistanceMiles } from "@/lib/geo";
import { loadDiscoverablePublicListings, publicListingWhereDiscoverable } from "@/lib/publicListings/queries";
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

function toFinderRow(
  base: {
    slug: string;
    name: string;
    city: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
  },
  opts: { href: string; kind: DiscoveryListingKind; bookable: boolean; hasSchedule?: boolean },
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
    name: base.name,
    city: base.city,
    region: base.region,
    lat: base.lat,
    lng: base.lng,
    discoverySlug,
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
      select: { city: true, region: true },
    }),
  ]);
  return [...venues, ...listings];
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
  const [venues, listings, counts] = await Promise.all([
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { slug: true, name: true, city: true, region: true, lat: true, lng: true },
    }),
    loadDiscoverablePublicListings(prisma),
    getDiscoveryLocationCounts(prisma),
  ]);

  const claimed = venues.map((v) =>
    toFinderRow(v, { href: venuePublicHref(v.slug), kind: "claimed", bookable: true }, counts),
  );

  const unclaimed = listings.map((l) => {
    const kind = listingKind(l.verificationStatus);
    const hasSchedule = l.schedules.length > 0;
    return toFinderRow(
      l,
      { href: listingPublicHref(l.slug), kind, bookable: false, hasSchedule },
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
  };

  const rows: Raw[] = [
    ...venues.map((v) => ({
      ...v,
      href: venuePublicHref(v.slug),
      kind: "claimed" as const,
      bookable: true,
    })),
    ...listings.map((l) => ({
      slug: l.slug,
      name: l.name,
      city: l.city,
      region: l.region,
      formattedAddress: l.formattedAddress,
      lat: l.lat,
      lng: l.lng,
      href: listingPublicHref(l.slug),
      kind: listingKind(l.verificationStatus),
      bookable: false,
      hasSchedule: l.schedules.length > 0,
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
