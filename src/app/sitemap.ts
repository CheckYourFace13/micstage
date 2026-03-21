import type { MetadataRoute } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://micstage.com";
  return raw.replace(/\/$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const now = new Date();

  const staticPaths = [
    "",
    "/performers",
    "/locations",
    "/why/venue-controlled-structure",
    "/why/no-double-booking",
    "/why/marketing-and-seo",
    "/login/musician",
    "/login/venue",
    "/register/musician",
    "/register/venue",
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

    const withCity = await prisma.venue.findMany({
      where: { city: { not: null } },
      select: { city: true },
    });
    const citySlugs = new Set<string>();
    for (const v of withCity) {
      const c = v.city?.trim();
      if (c) citySlugs.add(slugify(c));
    }

    const locationEntries: MetadataRoute.Sitemap = [...citySlugs].map((slug) => ({
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
