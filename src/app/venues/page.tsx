import Link from "next/link";
import type { Metadata } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { locationDirectorySlug } from "@/lib/locationSlugValidation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic venues directory by city",
  description:
    "Browse MicStage open mic venues by city and region. Open each venue page for recurring schedule details, open slots, and public performer activity.",
  path: "/venues",
});

export default async function VenuesDirectoryPage() {
  const prisma = getPrismaOrNull();
  let venues: {
    id: string;
    slug: string;
    name: string;
    city: string | null;
    region: string | null;
    updatedAt: Date;
  }[] = [];
  let queryFailed = false;

  try {
    if (prisma) {
      venues = await prisma.venue.findMany({
        orderBy: [{ city: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          region: true,
          updatedAt: true,
        },
      });
    }
  } catch {
    queryFailed = true;
  }

  const grouped = new Map<string, { city: string; region: string | null; rows: typeof venues }>();
  for (const v of venues) {
    const city = (v.city ?? "").trim();
    if (!city) continue;
    const region = v.region?.trim() || null;
    const key = `${city.toLowerCase()}|${(region ?? "").toLowerCase()}`;
    const cur = grouped.get(key);
    if (cur) {
      cur.rows.push(v);
    } else {
      grouped.set(key, { city, region, rows: [v] });
    }
  }
  const sections = [...grouped.values()].sort((a, b) => a.city.localeCompare(b.city));
  const totalLocations = sections.length;
  const totalVenues = venues.length;
  const recentlyUpdated = [...venues]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 6);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Venues", item: absoluteUrl("/venues") }],
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MicStage open mic venues",
    itemListElement: venues.slice(0, 100).map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: v.name,
      url: absoluteUrl(`/venues/${v.slug}`),
    })),
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
        <h1 className="om-heading text-4xl tracking-wide">Open mic venues</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/70">
          Explore MicStage venue pages by city. Each venue page includes public schedule details, upcoming dates, and
          booking visibility for artists and local fans.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">{totalVenues} public venues</span>
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">{totalLocations} location groups</span>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/locations">
            Browse by performer activity
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/resources">
            Open mic guides
          </Link>
        </div>

        {queryFailed ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/85">
            We could not load the venue directory right now. Please try again shortly.
          </div>
        ) : null}

        {sections.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            No public venues are available yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-6">
            {recentlyUpdated.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xl font-semibold">Recently updated venues</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {recentlyUpdated.map((v) => (
                    <Link
                      key={v.id}
                      href={`/venues/${v.slug}`}
                      className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm hover:bg-black/40"
                    >
                      {v.name}
                      <span className="ml-2 text-xs text-white/55">
                        {(v.city ?? "").trim()}
                        {v.region ? `, ${v.region}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {sections.map((section) => (
              <section key={`${section.city}|${section.region ?? ""}`}>
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-xl font-semibold">
                    {section.city}
                    {section.region ? `, ${section.region}` : ""}
                  </h2>
                  <Link
                    href={`/locations/${locationDirectorySlug(section.city, section.region)}/performers`}
                    className="text-xs text-white/60 underline hover:text-white"
                  >
                    See artists in this area
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.rows.map((v) => (
                    <Link
                      key={v.id}
                      href={`/venues/${v.slug}`}
                      className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                    >
                      <div className="font-semibold">{v.name}</div>
                      <div className="mt-1 text-xs text-white/60">
                        Public schedule and booking details
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
