import type { PrismaClient } from "@/generated/prisma/client";
import {
  getVenueCityDiscoveryCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
} from "@/lib/discoveryMarket";

export type PublicDiscoveryLocationRow = {
  key: string;
  label: string;
  count: number;
  slug: string;
};

export type OpenMicFinderVenue = {
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  discoverySlug: string | null;
};

export async function loadPublicDiscoveryLocationRows(prisma: PrismaClient): Promise<PublicDiscoveryLocationRow[]> {
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { city: true, region: true, id: true },
  });

  const counts = await getVenueCityDiscoveryCounts();
  const byDiscovery = new Map<string, { label: string; count: number }>();
  for (const v of venues) {
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
  const venues = await prisma.venue.findMany({
    orderBy: [{ name: "asc" }],
    select: { slug: true, name: true, city: true, region: true, lat: true, lng: true },
  });
  const counts = await getVenueCityDiscoveryCounts();
  return venues.map((v) => {
    const city = (v.city ?? "").trim();
    const rawSlug = city ? primaryDiscoverySlugForVenue(city, v.region, counts) : "";
    const discoverySlug = rawSlug || null;
    return {
      slug: v.slug,
      name: v.name,
      city: v.city,
      region: v.region,
      lat: v.lat,
      lng: v.lng,
      discoverySlug,
    };
  });
}
