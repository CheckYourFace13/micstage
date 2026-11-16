import { getManagedFeed } from "@/lib/gravyblock-managed";
import type { MetadataRoute } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { computeCitySlugVenueCounts, primaryDiscoverySlugForVenue } from "@/lib/discoveryMarket";
import { mapDiscoverySlugIndexSignals, shouldIndexDiscoveryPage } from "@/lib/seo/discoveryIndex";
import { siteOrigin } from "@/lib/publicSeo";
import { getAllResourceArticles } from "@/lib/resourcesContent";
import { marketingSitemapSupplements } from "@/lib/marketing/indexability";
import { publicListingWhereDiscoverable } from "@/lib/publicListings/queries";
import { listingMeetsPublicSeoIndexGate, venueIsSitemapEligible } from "@/lib/publicListings/listingSeo";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { evaluateOpenMicEvidence } from "@/lib/publicListings/openMicEvidence";
import { dedupeByPublicDiscoveryIdentity } from "@/lib/publicListings/publicDiscoveryIdentity";
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";

export const revalidate = 3600;

async function baseSitemap(): Promise<MetadataRoute.Sitemap> {
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
    "/resources/open-mic-gear",
    "/faq",
    "/artists",
    "/register/venue",
    "/register/musician",
    "/host",
    "/about",
    "/register/promoter",
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
          : path === "/artists" || path === "/host"
            ? 0.9
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
    const [venues, listings] = await Promise.all([
      prisma.venue.findMany({
        select: {
          slug: true,
          updatedAt: true,
          city: true,
          region: true,
          name: true,
          googlePlaceId: true,
          formattedAddress: true,
          eventTemplates: { where: { isPublic: true }, select: { id: true, isPublic: true } },
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
          googlePlaceId: true,
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

    // Same identity dedupe as /locations + hub pages — inflated duplicates must not force index.
    const hubInventory = dedupeByPublicDiscoveryIdentity(
      [
        ...venues.map((v) => ({
          name: v.name,
          city: v.city,
          region: v.region,
          googlePlaceId: v.googlePlaceId,
          updatedAt: v.updatedAt,
          hasSchedule: (v.eventTemplates ?? []).length > 0,
          kind: "claimed" as const,
        })),
        ...listings
          .filter(
            (l) =>
              isPublicListingNameOk(l.name) &&
              !listingHasGeoConflict({
                region: l.region,
                city: l.city,
                formattedAddress: l.formattedAddress,
                name: l.name,
              }) &&
              evaluateOpenMicEvidence({
                listingName: l.name,
                schedules: l.schedules,
                sourceUrl: l.sourceUrl,
                websiteUrl: l.websiteUrl,
              }).trusted,
          )
          .map((l) => ({
            name: l.name,
            city: l.city,
            region: l.region,
            googlePlaceId: l.googlePlaceId,
            updatedAt: l.updatedAt,
            hasSchedule: l.schedules.length > 0,
            kind: "verified" as const,
          })),
      ],
      (r) => ({ googlePlaceId: r.googlePlaceId, name: r.name, city: r.city, region: r.region }),
      (r) => ({ kind: r.kind, hasSchedule: r.hasSchedule }),
    );
    const counts = computeCitySlugVenueCounts(hubInventory);
    const locationUpdatedAt = new Map<string, Date>();
    const listingCountBySlug = new Map<string, { count: number; hasSchedule: boolean }>();
    for (const row of hubInventory) {
      const city = (row.city ?? "").trim();
      if (!city) continue;
      const slug = primaryDiscoverySlugForVenue(city, row.region, counts);
      if (!slug) continue;
      const prev = locationUpdatedAt.get(slug);
      if (!prev || row.updatedAt > prev) {
        locationUpdatedAt.set(slug, row.updatedAt);
      }
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await baseSitemap();
  const origin = siteOrigin();
  const items = (await getManagedFeed())?.items ?? [];
  if (items.length === 0) return base;
  return [...base, { url: `${origin}/insights`, changeFrequency: "weekly" as const, priority: 0.5 }, ...items.map((i) => ({ url: `${origin}/insights/${i.slug}`, lastModified: new Date(i.publishedAt), changeFrequency: "monthly" as const, priority: 0.5 }))];
}
