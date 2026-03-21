import type { Metadata } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { LocationsDirectory, type LocationRow } from "./LocationsDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic venues by city",
  description:
    "Browse MicStage venues running open mics: search by city or region, then open public schedules, slots, and performer activity.",
  path: "/locations",
});

export default async function LocationsPage() {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return <PublicDataUnavailable title="Venue directory unavailable" />;
  }

  let rows: LocationRow[] = [];
  try {
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
      slug: slugify(l.city),
    }));
  } catch {
    return <PublicDataUnavailable title="Venue directory unavailable" />;
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <h1 className="om-heading text-4xl tracking-wide">Registered open mic venues</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Venues on MicStage with a listed city. Search below, then open a city to see public performer activity and
          shareable pages.
        </p>

        <LocationsDirectory rows={rows} />
      </main>
    </div>
  );
}
