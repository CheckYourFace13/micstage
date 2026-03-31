import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/publicSeo";
import { getPrismaOrNull } from "@/lib/prisma";
import { locationDirectorySlug } from "@/lib/locationSlugValidation";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { LocationsDirectory, type LocationRow } from "./LocationsDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic artist activity by location",
  description:
    "Discover where open mic activity is happening. Browse city and region pages to see upcoming performers, linked venues, and shareable local discovery pages.",
  path: "/locations",
});

export default async function LocationsPage() {
  const prisma = getPrismaOrNull();
  let rows: LocationRow[] = [];
  let queryFailed = false;

  try {
    if (prisma) {
      const venues = await prisma.venue.findMany({
        where: { city: { not: null } },
        select: { city: true, region: true, id: true },
      });

      const grouped = new Map<string, { city: string; region: string | null; count: number }>();
      for (const v of venues) {
        const city = (v.city ?? "").trim();
        if (!city) continue;
        const key = `${city.toLowerCase()}|${(v.region ?? "").toLowerCase()}`;
        const cur = grouped.get(key);
        if (cur) cur.count += 1;
        else grouped.set(key, { city, region: v.region, count: 1 });
      }

      const locations = Array.from(grouped.values()).sort((a, b) => a.city.localeCompare(b.city));

      rows = locations.map((l) => ({
        key: `${l.city}|${l.region ?? ""}`,
        city: l.city,
        region: l.region,
        count: l.count,
        slug: locationDirectorySlug(l.city, l.region),
      }));
    }
  } catch (err) {
    console.error("DB query failed", err);
    queryFailed = true;
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Locations", item: absoluteUrl("/locations") }],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Open mic locations",
    itemListElement: rows.slice(0, 100).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.region ? `${r.city}, ${r.region}` : r.city,
      url: absoluteUrl(`/locations/${r.slug}/performers`),
    })),
  };
  const featured = [...rows].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        {rows.length > 0 ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        ) : null}
        <h1 className="om-heading text-4xl tracking-wide">Registered open mic venues</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Venues on MicStage with a listed city. Search below, then open a city to see public artist activity and
          shareable pages.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">{rows.length} locations</span>
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
            {rows.reduce((sum, r) => sum + r.count, 0)} venue profiles
          </span>
        </div>
        <p className="mt-2 text-sm text-white/65">
          Looking for specific venues? Browse the{" "}
          <Link className="underline hover:text-white" href="/venues">
            open mic venue directory
          </Link>
          {" "}or read{" "}
          <Link className="underline hover:text-white" href="/resources">
            open mic resources
          </Link>
          .
        </p>
        {featured.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Most active location directories</h2>
            <p className="mt-1 text-sm text-white/70">
              Start with places that currently have the highest number of listed venues.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {featured.map((r) => (
                <Link
                  key={r.key}
                  href={`/locations/${r.slug}/performers`}
                  className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
                >
                  {r.region ? `${r.city}, ${r.region}` : r.city} ({r.count})
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {queryFailed ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/85">
            We couldn’t load the venue directory. Try again in a moment.
          </div>
        ) : null}

        <LocationsDirectory rows={rows} />
      </main>
    </div>
  );
}
