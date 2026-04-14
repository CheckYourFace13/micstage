import type { MetadataRoute } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { computeCitySlugVenueCounts, primaryDiscoverySlugForVenue } from "@/lib/discoveryMarket";
import { siteOrigin } from "@/lib/publicSeo";
import { getAllResourceArticles } from "@/lib/resourcesContent";
import { marketingSitemapSupplements } from "@/lib/marketing/indexability";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const staticLastModified = process.env.VERCEL_GIT_COMMIT_DATE
    ? new Date(process.env.VERCEL_GIT_COMMIT_DATE)
    : new Date();

  const staticPaths = [
    "",
    "/find-open-mics",
    "/map",
    "/performers",
    "/locations",
    "/venues",
    "/resources",
    "/why/venue-controlled-structure",
    "/why/no-double-booking",
    "/why/marketing-and-seo",
    "/privacy",
    "/terms",
    "/contact",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: staticLastModified,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : path === "/find-open-mics" ? 0.95 : 0.85,
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
    const venues = await prisma.venue.findMany({
      select: { slug: true, updatedAt: true, city: true, region: true },
    });

    const venueEntries: MetadataRoute.Sitemap = venues.map((v) => ({
      url: `${base}/venues/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

    const counts = computeCitySlugVenueCounts(venues);
    const locationUpdatedAt = new Map<string, Date>();
    for (const v of venues) {
      const city = (v.city ?? "").trim();
      if (!city) continue;
      const slug = primaryDiscoverySlugForVenue(city, v.region, counts);
      if (!slug) continue;
      const prev = locationUpdatedAt.get(slug);
      if (!prev || v.updatedAt > prev) {
        locationUpdatedAt.set(slug, v.updatedAt);
      }
    }
    const locationEntries: MetadataRoute.Sitemap = [...locationUpdatedAt.entries()].map(([slug, updatedAt]) => ({
      url: `${base}/locations/${slug}/performers`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.65,
    }));

    return [...staticEntries, ...resourceEntries, ...venueEntries, ...locationEntries, ...marketingSitemapSupplements()];
  } catch {
    return [...staticEntries, ...resourceEntries, ...marketingSitemapSupplements()];
  }
}
