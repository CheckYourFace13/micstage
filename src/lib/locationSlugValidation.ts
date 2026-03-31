import { cache } from "react";
import { notFound } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/** Matches slugify() output for city names (and venue slugs). */
export const PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LEN = 120;

export function isValidPublicSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LEN && PUBLIC_SLUG_RE.test(slug);
}

/** Public location URL segment: city + optional region so duplicate city names do not collide. */
export function locationDirectorySlug(city: string, region: string | null | undefined): string {
  const c = (city ?? "").trim();
  const r = (region ?? "").trim();
  if (!c) return "";
  return r ? slugify(`${c} ${r}`) : slugify(c);
}

/**
 * Cached set of location slugs derived from venues that list a city.
 * Includes `city-region` composites when region is set, plus a bare `slugify(city)` alias only when that city name
 * is unambiguous (single distinct region among venues).
 * `null` = DB unavailable or query failed (caller should not 404 solely on this).
 */
export const getValidLocationSlugs = cache(async (): Promise<Set<string> | null> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });

    const cityKeyToRegions = new Map<string, Set<string>>();
    for (const v of venues) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const cityKey = city.toLowerCase();
      const reg = (v.region ?? "").trim().toLowerCase();
      if (!cityKeyToRegions.has(cityKey)) cityKeyToRegions.set(cityKey, new Set());
      cityKeyToRegions.get(cityKey)!.add(reg);
    }

    const slugs = new Set<string>();
    const seenPairs = new Set<string>();
    for (const v of venues) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const pairKey = `${city.toLowerCase()}|${(v.region ?? "").trim().toLowerCase()}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const s = locationDirectorySlug(city, v.region);
      if (s) slugs.add(s);
    }

    for (const [cityKey, regions] of cityKeyToRegions) {
      if (regions.size <= 1) {
        const rep = venues.find((v) => (v.city ?? "").trim().toLowerCase() === cityKey);
        if (rep) {
          const bare = slugify((rep.city ?? "").trim());
          if (bare) slugs.add(bare);
        }
      }
    }

    return slugs;
  } catch {
    return null;
  }
});

/**
 * Canonical public location slugs keyed by each accepted incoming alias.
 * Canonical always prefers `city-region` when region exists for that venue pair.
 */
export const getLocationAliasToCanonicalMap = cache(async (): Promise<Map<string, string> | null> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });

    const map = new Map<string, string>();
    const cityKeyToRegionSet = new Map<string, Set<string>>();
    for (const v of venues) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const cityKey = city.toLowerCase();
      const region = (v.region ?? "").trim();
      if (!cityKeyToRegionSet.has(cityKey)) cityKeyToRegionSet.set(cityKey, new Set());
      cityKeyToRegionSet.get(cityKey)!.add(region.toLowerCase());
    }

    for (const v of venues) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const region = (v.region ?? "").trim();
      const canonical = locationDirectorySlug(city, region || null);
      if (!canonical) continue;
      map.set(canonical, canonical);

      const bare = slugify(city);
      if (!bare) continue;
      const regionSet = cityKeyToRegionSet.get(city.toLowerCase()) ?? new Set<string>();
      if (regionSet.size <= 1) {
        map.set(bare, canonical);
      }
    }

    return map;
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
  const prisma = getPrismaOrNull();
  if (!prisma) return locationSlugToFallbackTitle(locationSlug);
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true, region: true },
    });
    const hit = venues.find(
      (v) =>
        locationDirectorySlug(v.city!, v.region) === locationSlug ||
        slugify((v.city ?? "").trim()) === locationSlug,
    );
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
