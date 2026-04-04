import { getPrismaOrNull } from "@/lib/prisma";
import {
  computeCitySlugVenueCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
} from "@/lib/discoveryMarket";

function regionCodeNorm(region: string | null | undefined): string | null {
  const t = (region ?? "").trim();
  if (t.length === 2) return t.toUpperCase();
  return null;
}

type LocationAggregate = {
  slug: string;
  label: string;
  venueCount: number;
  lat: number | null;
  lng: number | null;
  regionHint: string | null;
};

export type RelatedLocation = {
  slug: string;
  label: string;
  venueCount: number;
  relation: "nearby" | "same-region";
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const rLat1 = toRad(aLat);
  const rLat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(rLat1) * Math.cos(rLat2);
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function discoveryLabelForVenueRow(
  slug: string,
  city: string,
  region: string | null,
): string {
  const rollup = rollupDiscoveryLabel(slug);
  if (rollup) return rollup;
  const r = region?.trim();
  return r ? `${city.trim()}, ${r}` : city.trim();
}

async function allDiscoveryAggregates(): Promise<LocationAggregate[]> {
  const prisma = getPrismaOrNull();
  if (!prisma) return [];
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { city: true, region: true, lat: true, lng: true },
  });
  const counts = computeCitySlugVenueCounts(venues);
  const grouped = new Map<
    string,
    { label: string; points: [number, number][]; count: number; regionHint: string | null }
  >();

  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const slug = primaryDiscoverySlugForVenue(city, v.region, counts);
    if (!slug) continue;
    const rc = regionCodeNorm(v.region);
    if (!grouped.has(slug)) {
      grouped.set(slug, {
        label: discoveryLabelForVenueRow(slug, city, v.region),
        points: [],
        count: 0,
        regionHint: rc,
      });
    }
    const cur = grouped.get(slug)!;
    cur.count += 1;
    if (!cur.regionHint && rc) cur.regionHint = rc;
    if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
      cur.points.push([v.lat as number, v.lng as number]);
    }
  }

  return [...grouped.entries()].map(([slug, g]) => {
    if (g.points.length === 0) {
      return { slug, label: g.label, venueCount: g.count, lat: null, lng: null, regionHint: g.regionHint };
    }
    const avgLat = g.points.reduce((s, p) => s + p[0], 0) / g.points.length;
    const avgLng = g.points.reduce((s, p) => s + p[1], 0) / g.points.length;
    return { slug, label: g.label, venueCount: g.count, lat: avgLat, lng: avgLng, regionHint: g.regionHint };
  });
}

export async function relatedLocationsForLocationSlug(locationSlug: string, limit = 6): Promise<RelatedLocation[]> {
  const all = await allDiscoveryAggregates();
  const base = all.find((l) => l.slug === locationSlug);
  if (!base) return [];
  return relatedFromBase(base, all, limit);
}

function relatedFromBase(base: LocationAggregate, all: LocationAggregate[], limit: number): RelatedLocation[] {
  const others = all.filter((l) => l.slug !== base.slug);
  if (base.lat != null && base.lng != null) {
    const geo = others
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        ...l,
        d: haversineKm(base.lat as number, base.lng as number, l.lat as number, l.lng as number),
      }))
      .sort((a, b) => a.d - b.d || b.venueCount - a.venueCount)
      .slice(0, limit)
      .map((l) => ({ slug: l.slug, label: l.label, venueCount: l.venueCount, relation: "nearby" as const }));
    if (geo.length >= Math.min(3, limit)) return geo;
  }

  const sameRegion = others
    .filter((l) => base.regionHint && l.regionHint === base.regionHint)
    .sort((a, b) => b.venueCount - a.venueCount)
    .slice(0, limit)
    .map((l) => ({ slug: l.slug, label: l.label, venueCount: l.venueCount, relation: "same-region" as const }));
  if (sameRegion.length > 0) return sameRegion;

  return others
    .sort((a, b) => b.venueCount - a.venueCount)
    .slice(0, limit)
    .map((l) => ({ slug: l.slug, label: l.label, venueCount: l.venueCount, relation: "same-region" as const }));
}

export async function relatedLocationsForVenue(
  venue: { city: string | null; region: string | null; lat: number | null; lng: number | null },
  limit = 5,
): Promise<RelatedLocation[]> {
  const city = (venue.city ?? "").trim();
  if (!city) return [];
  const prisma = getPrismaOrNull();
  if (!prisma) return [];
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { city: true, region: true },
  });
  const counts = computeCitySlugVenueCounts(venues);
  const currentSlug = primaryDiscoverySlugForVenue(city, venue.region, counts);
  return relatedLocationsForLocationSlug(currentSlug, limit);
}
