import type { PrismaClient } from "@/generated/prisma/client";
import {
  getVenueCityDiscoveryCounts,
  primaryDiscoverySlugForVenue,
  venueIncludedInDiscoveryPage,
} from "@/lib/discoveryMarket";

/**
 * Whether a dynamic discovery/market URL should be indexed vs. thin noindex.
 * Core listing pages (/, /find-open-mics, /locations index, etc.) stay indexed separately.
 *
 * City open-mic hubs should set `requireMeaningfulInventory: true` so a single
 * recurring weekday listing cannot force an indexed thin city page.
 */
export function shouldIndexDiscoveryPage(opts: {
  venueCount: number;
  hasPublicSchedule: boolean;
  hasEditorialContent?: boolean;
  /** Public-quality open-mic rows for the market (venues + verified listings). */
  listingCount?: number;
  /**
   * Open-mic city hubs: index when inventory ≥ 3, or when inventory ≥ 2 and
   * there is a trusted schedule signal. Never index a 1-listing city on schedule alone.
   * Performers pages leave this false (legacy: venueCount≥3 OR future public schedule).
   */
  requireMeaningfulInventory?: boolean;
}): boolean {
  if (Boolean(opts.hasEditorialContent)) return true;
  const inventory = typeof opts.listingCount === "number" ? opts.listingCount : opts.venueCount;
  if (inventory >= 3) return true;
  if (opts.requireMeaningfulInventory) {
    return inventory >= 2 && opts.hasPublicSchedule;
  }
  return opts.hasPublicSchedule;
}

/** Index signals for `/locations/[slug]/performers` (one slug). */
export async function getDiscoveryMarketIndexSignals(
  prisma: PrismaClient,
  locationSlug: string,
): Promise<{ venueCount: number; hasPublicSchedule: boolean }> {
  const counts = await getVenueCityDiscoveryCounts();
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { id: true, city: true, region: true },
  });
  const venueIds = venues
    .filter((v) => venueIncludedInDiscoveryPage(v, locationSlug, counts))
    .map((v) => v.id);
  const venueCount = venueIds.length;
  if (venueIds.length === 0) {
    return { venueCount: 0, hasPublicSchedule: false };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const withFuture = await prisma.eventTemplate.count({
    where: {
      isPublic: true,
      venueId: { in: venueIds },
      instances: {
        some: {
          date: { gte: today },
          isCancelled: false,
        },
      },
    },
  });
  return { venueCount, hasPublicSchedule: withFuture > 0 };
}

/** Batch index signals for all discovery slugs (sitemap). */
export async function mapDiscoverySlugIndexSignals(
  prisma: PrismaClient,
): Promise<Map<string, { venueCount: number; hasPublicSchedule: boolean }>> {
  const counts = await getVenueCityDiscoveryCounts();
  const venues = await prisma.venue.findMany({
    where: { city: { not: null } },
    select: { id: true, city: true, region: true },
  });

  const slugToIds = new Map<string, string[]>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const slug = primaryDiscoverySlugForVenue(city, v.region, counts);
    if (!slug) continue;
    const arr = slugToIds.get(slug) ?? [];
    arr.push(v.id);
    slugToIds.set(slug, arr);
  }

  const allIds = [...slugToIds.values()].flat();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const venueIdsWithSchedule = new Set<string>();
  if (allIds.length > 0) {
    const templates = await prisma.eventTemplate.findMany({
      where: {
        isPublic: true,
        venueId: { in: allIds },
        instances: {
          some: {
            date: { gte: today },
            isCancelled: false,
          },
        },
      },
      select: { venueId: true },
    });
    for (const t of templates) {
      venueIdsWithSchedule.add(t.venueId);
    }
  }

  const result = new Map<string, { venueCount: number; hasPublicSchedule: boolean }>();
  for (const [slug, ids] of slugToIds) {
    result.set(slug, {
      venueCount: ids.length,
      hasPublicSchedule: ids.some((id) => venueIdsWithSchedule.has(id)),
    });
  }
  return result;
}
