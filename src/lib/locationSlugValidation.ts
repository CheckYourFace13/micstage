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

/**
 * Cached set of location slugs derived from venues that list a city.
 * `null` = DB unavailable or query failed (caller should not 404 solely on this).
 */
export const getValidLocationSlugs = cache(async (): Promise<Set<string> | null> => {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  try {
    const venues = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true },
    });
    return new Set(
      venues
        .map((v) => slugify((v.city ?? "").trim()))
        .filter((s) => s.length > 0),
    );
  } catch {
    return null;
  }
});

/** 404 when slug is malformed or (when we have city data) unknown. */
export async function assertKnownLocationSlugOrNotFound(locationSlug: string): Promise<void> {
  if (!isValidPublicSlug(locationSlug)) notFound();
  const valid = await getValidLocationSlugs();
  if (valid && valid.size > 0 && !valid.has(locationSlug)) notFound();
}
