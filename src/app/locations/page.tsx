import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { LocationsDirectory, type LocationRow } from "./LocationsDirectory";

export const metadata = {
  title: "Open mic venues by city",
  description:
    "Search MicStage-registered venues with open mics. Browse by city and see public performer activity.",
};

export default async function LocationsPage() {
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

  const rows: LocationRow[] = locations.map((l) => ({
    key: `${l.city}|${l.region ?? ""}`,
    city: l.city,
    region: l.region,
    count: l.count,
    slug: slugify(l.city),
  }));

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
