import type { MetadataRoute } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { getValidLocationSlugs } from "@/lib/locationSlugValidation";
import { siteOrigin } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const now = new Date();

  const staticPaths = [
    "",
    "/performers",
    "/locations",
    "/why/venue-controlled-structure",
    "/why/no-double-booking",
    "/why/marketing-and-seo",
    "/privacy",
    "/terms",
    "/contact",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.85,
  }));

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return staticEntries;
  }

  try {
    const venues = await prisma.venue.findMany({
      select: { slug: true, updatedAt: true },
    });

    const venueEntries: MetadataRoute.Sitemap = venues.map((v) => ({
      url: `${base}/venues/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

    const validLocationSlugs = await getValidLocationSlugs();
    const locationEntries: MetadataRoute.Sitemap =
      validLocationSlugs == null
        ? []
        : [...validLocationSlugs].map((slug) => ({
            url: `${base}/locations/${slug}/performers`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.65,
          }));

    return [...staticEntries, ...venueEntries, ...locationEntries];
  } catch {
    return staticEntries;
  }
}
