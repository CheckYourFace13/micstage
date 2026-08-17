import type { MetadataRoute } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { computeCitySlugVenueCounts, primaryDiscoverySlugForVenue } from "@/lib/discoveryMarket";
import { mapDiscoverySlugIndexSignals, shouldIndexDiscoveryPage } from "@/lib/seo/discoveryIndex";
import { siteOrigin } from "@/lib/publicSeo";
import { getAllResourceArticles } from "@/lib/resourcesContent";
import { marketingSitemapSupplements } from "@/lib/marketing/indexability";
import { publicListingWhereDiscoverable } from "@/lib/publicListings/queries";
import { listingMeetsPublicSeoIndexGate, venueIsSitemapEligible } from "@/lib/publicListings/listingSeo";
import { loadOpenMicFinderVenues } from "@/lib/publicListings/discoveryMerge";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  // Prefer a deploy-stable stamp; do not invent a fresh timestamp on every request.
  const staticLastModified = process.env.VERCEL_GIT_COMMIT_DATE
    ? new Date(process.env.VERCEL_GIT_COMMIT_DATE)
    : process.env.MICSTAGE_SITEMAP_STATIC_LASTMOD
      ? new Date(process.env.MICSTAGE_SITEMAP_STATIC_LASTMOD)
      : undefined;

  const staticPaths = [
    "",
    "/find-open-mics",
    "/map",
    "/performers",
    "/locations",
    "/venues",
    "/resources",
    "/register/venue",
    "/register/musician",
    "/register/promoter",
    "/promoter/apply",
    "/media",
    "/media/how-to-artists",
    "/media/how-to-venues",
    "/media/brand-images",
    "/media/press-releases",
    "/why/venue-controlled-structure",
    "/why/no-double-booking",
    "/why/marketing-and-seo",
    "/privacy",
    "/terms",
    "/contact",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    ...(staticLastModified && !Number.isNaN(staticLastModified.getTime())
      ? { lastModified: staticLastModified }
      : {}),
    changeFrequency: "weekly" as const,
    priority:
      path === ""
        ? 1
        : path === "/find-open-mics"
          ? 0.95
          : path.startsWith("/register/")
            ? 0.88
            : 0.85,
  }));

  const prisma = getPrismaOrNull();
  const resourceEntries: MetadataRoute.Sitemap = getAllResourceArticles().map((a) => ({
    url: `${base}/resources/${a.slug}`,
    lastModified: new Date(a.updatedAt),
    changeFrequency: "monthly",
    priority: 0.72,
  }));
  if (!prisma) {
    return [...staticEntries, ...resourceEntries, ...marketingSitemapSupplements()];
  }

  try {
    const [venues, listings, finderRows] = await Promise.all([
      prisma.venue.findMany({
        select: {
          slug: true,
          updatedAt: true,
          city: true,
          region: true,
          name: true,
          googlePlaceId: true,
          formattedAddress: true,
        },
      }),
      prisma.publicOpenMicListing.findMany({
        where: publicListingWhereDiscoverable(),
        select: {
          slug: true,
          updatedAt: true,
          city: true,
          region: true,
          name: true,
          verificationStatus: true,
          formattedAddress: true,
          lastVerifiedAt: true,
          removedAt: true,
          sourceUrl: true,
          websiteUrl: true,
          schedules: {
            where: { isActive: true },
            select: {
              id: true,
              title: true,
              description: true,
              performanceFormat: true,
            },
          },
        },
      }),
      loadOpenMicFinderVenues(prisma),
    ]);

    const venueEntries: MetadataRoute.Sitemap = venues
      .filter((v) => venueIsSitemapEligible(v))
      .map((v) => ({
        url: `${base}/venues/${v.slug}`,
        lastModified: v.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));

    const indexableListings = listings.filter((l) => listingMeetsPublicSeoIndexGate(l));

    const listingEntries: MetadataRoute.Sitemap = indexableListings.map((l) => ({
      url: `${base}/open-mics/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly",
      priority: 0.72,
    }));

    const combinedLocations = [
      ...venues.map((v) => ({ city: v.city, region: v.region, updatedAt: v.updatedAt })),
      ...listings.map((l) => ({ city: l.city, region: l.region, updatedAt: l.updatedAt })),
    ];
    const counts = computeCitySlugVenueCounts(combinedLocations);
    const locationUpdatedAt = new Map<string, Date>();
    for (const v of combinedLocations) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const slug = primaryDiscoverySlugForVenue(city, v.region, counts);
      if (!slug) continue;
      const prev = locationUpdatedAt.get(slug);
      if (!prev || v.updatedAt > prev) {
        locationUpdatedAt.set(slug, v.updatedAt);
      }
    }

    const listingCountBySlug = new Map<string, { count: number; hasSchedule: boolean }>();
    for (const row of finderRows) {
      const slug = row.discoverySlug;
      if (!slug) continue;
      const cur = listingCountBySlug.get(slug) ?? { count: 0, hasSchedule: false };
      cur.count += 1;
      if (row.hasSchedule) cur.hasSchedule = true;
      listingCountBySlug.set(slug, cur);
    }

    const locationOpenMicEntries: MetadataRoute.Sitemap = [...locationUpdatedAt.entries()]
      .filter(([slug]) => {
        const inv = listingCountBySlug.get(slug);
        if (!inv) return false;
        return shouldIndexDiscoveryPage({
          venueCount: inv.count,
          listingCount: inv.count,
          hasPublicSchedule: inv.hasSchedule,
          requireMeaningfulInventory: true,
        });
      })
      .map(([slug, updatedAt]) => ({
        url: `${base}/locations/${slug}/open-mics`,
        lastModified: updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    const indexBySlug = await mapDiscoverySlugIndexSignals(prisma);
    const locationPerformerEntries: MetadataRoute.Sitemap = [...locationUpdatedAt.entries()]
      .filter(([slug]) => {
        const sig = indexBySlug.get(slug);
        if (!sig) return false;
        return shouldIndexDiscoveryPage(sig);
      })
      .map(([slug, updatedAt]) => ({
        url: `${base}/locations/${slug}/performers`,
        lastModified: updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.65,
      }));

    return [
      ...staticEntries,
      ...resourceEntries,
      ...venueEntries,
      ...listingEntries,
      ...locationOpenMicEntries,
      ...locationPerformerEntries,
      ...marketingSitemapSupplements(),
    ];
  } catch {
    return [...staticEntries, ...resourceEntries, ...marketingSitemapSupplements()];
  }
}
