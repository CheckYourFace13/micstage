import { cache } from "react";
import { notFound } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import {
  buildDiscoveryValidationData,
  getDiscoveryValidationFromDb,
  getVenueCityDiscoveryCounts,
  primaryDiscoverySlugForVenue,
  rollupDiscoveryLabel,
} from "@/lib/discoveryMarket";
export { locationDirectorySlug } from "@/lib/locationDirectorySlug";

/** Matches slugify() output for city names (and venue slugs). */
export const PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LEN = 120;

export function isValidPublicSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LEN && PUBLIC_SLUG_RE.test(slug);
}

/**
 * Cached set of location slugs derived from venues + metro/regional discovery rollups.
 * `null` = DB unavailable or query failed (caller should not 404 solely on this).
 */
export const getValidLocationSlugs = cache(async (): Promise<Set<string> | null> => {
  const d = await getDiscoveryValidationFromDb();
  if (d) return d.validSlugs;

  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    return buildDiscoveryValidationData(venues).validSlugs;
  } catch {
    return null;
  }
});

/**
 * Canonical discovery slug for each alias (thin cities redirect to metro/regional hubs).
 */
export const getLocationAliasToCanonicalMap = cache(async (): Promise<Map<string, string> | null> => {
  const d = await getDiscoveryValidationFromDb();
  if (d) return d.aliasToCanonical;

  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    return buildDiscoveryValidationData(venues).aliasToCanonical;
  } catch {
    return null;
  }
});

export async function canonicalLocationSlugOrNull(locationSlug: string): Promise<string | null> {
  const map = await getLocationAliasToCanonicalMap();
  if (!map) return null;
  return map.get(locationSlug) ?? null;
}

/** Human label for a location slug (for headings / metadata). */
export function locationSlugToFallbackTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export async function resolveLocationPlaceTitle(locationSlug: string): Promise<string> {
  const rollup = rollupDiscoveryLabel(locationSlug);
  if (rollup) return rollup;

  const prisma = getPrismaOrNull();
  if (!prisma) return locationSlugToFallbackTitle(locationSlug);
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    const counts = await getVenueCityDiscoveryCounts();
    const hit = venues.find((v) => {
      const c = (v.city ?? "").trim();
      if (!c) return false;
      return primaryDiscoverySlugForVenue(c, v.region, counts) === locationSlug;
    });
    if (hit?.city) {
      const c = hit.city.trim();
      const r = hit.region?.trim();
      return r ? `${c}, ${r}` : c;
    }
  } catch {
    /* ignore */
  }
  return locationSlugToFallbackTitle(locationSlug);
}

/** 404 when slug is malformed or (when we have city data) unknown. */
export async function assertKnownLocationSlugOrNotFound(locationSlug: string): Promise<void> {
  if (!isValidPublicSlug(locationSlug)) notFound();
  const valid = await getValidLocationSlugs();
  if (valid && valid.size > 0 && !valid.has(locationSlug)) notFound();
}
