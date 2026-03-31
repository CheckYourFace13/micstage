import { getPrismaOrNull } from "@/lib/prisma";
import { locationDirectorySlug } from "@/lib/locationSlugValidation";
import { slugify } from "@/lib/slug";

type LocationAggregate = {
  slug: string;
  city: string;
  region: string | null;
  label: string;
  venueCount: number;
  lat: number | null;
  lng: number | null;
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

async function allLocationAggregates(): Promise<LocationAggregate[]> {
  const prisma = getPrismaOrNull();
  if (!prisma) return [];
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { city: true, region: true, lat: true, lng: true },
  });
  const grouped = new Map<string, { city: string; region: string | null; points: [number, number][]; count: number }>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const region = v.region?.trim() || null;
    const key = `${city.toLowerCase()}|${(region ?? "").toLowerCase()}`;
    if (!grouped.has(key)) grouped.set(key, { city, region, points: [], count: 0 });
    const cur = grouped.get(key)!;
    cur.count += 1;
    if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
      cur.points.push([v.lat as number, v.lng as number]);
    }
  }
  return [...grouped.values()].map((g) => {
    const slug = locationDirectorySlug(g.city, g.region);
    const label = g.region ? `${g.city}, ${g.region}` : g.city;
    if (g.points.length === 0) return { slug, city: g.city, region: g.region, label, venueCount: g.count, lat: null, lng: null };
    const avgLat = g.points.reduce((s, p) => s + p[0], 0) / g.points.length;
    const avgLng = g.points.reduce((s, p) => s + p[1], 0) / g.points.length;
    return { slug, city: g.city, region: g.region, label, venueCount: g.count, lat: avgLat, lng: avgLng };
  });
}

export async function relatedLocationsForLocationSlug(locationSlug: string, limit = 6): Promise<RelatedLocation[]> {
  const all = await allLocationAggregates();
  const base = all.find((l) => l.slug === locationSlug || slugify(l.city) === locationSlug);
  if (!base) return [];

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

  return others
    .filter((l) => (l.region ?? "").toLowerCase() === (base.region ?? "").toLowerCase())
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
  const currentSlug = locationDirectorySlug(city, venue.region);
  return relatedLocationsForLocationSlug(currentSlug, limit);
}
