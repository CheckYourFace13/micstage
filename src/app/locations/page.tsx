import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/publicSeo";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadPublicDiscoveryLocationRows, type PublicDiscoveryLocationRow } from "@/lib/discoveryLocationRows";
import { MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY } from "@/lib/discoveryMarket";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { LocationsDirectory } from "./LocationsDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic artist activity by metro & region",
  description:
    "Discover open mic activity by metro and regional markets. Smaller towns roll into larger hubs until there are enough local venues for a dedicated market page—each venue still keeps its exact address on its profile.",
  path: "/locations",
});

export default async function LocationsPage() {
  const prisma = getPrismaOrNull();
  let rows: PublicDiscoveryLocationRow[] = [];
  let queryFailed = false;

  try {
    if (prisma) {
      rows = await loadPublicDiscoveryLocationRows(prisma);
    }
  } catch (err) {
    console.error("DB query failed", err);
    queryFailed = true;
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Markets", item: absoluteUrl("/locations") }],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Open mic discovery markets",
    itemListElement: rows.slice(0, 100).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.label,
      url: absoluteUrl(`/locations/${r.slug}/performers`),
    })),
  };
  const featured = [...rows].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        {rows.length > 0 ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        ) : null}
        <h1 className="om-heading text-3xl tracking-wide sm:text-4xl">Open mic discovery by market</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Browse metro and regional hubs—not every small town gets its own directory page yet. When a place has fewer than{" "}
          <span className="text-white/85">{MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY}</span> MicStage venues, we group it into a
          broader market (for example Chicagoland or Central Illinois) so discovery is easier. Addresses on each venue page
          stay exact.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">{rows.length} discovery markets</span>
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
            {rows.reduce((sum, r) => sum + r.count, 0)} venue profiles
          </span>
        </div>
        <p className="mt-2 text-sm text-white/65">
          Looking for venues near you? Start with{" "}
          <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/find-open-mics">
            Find Local Open Mic&apos;s
          </Link>
          , the{" "}
          <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/map">
            open mic map
          </Link>
          , or browse the{" "}
          <Link className="underline hover:text-white" href="/venues">
            full venue directory
          </Link>
          {" "}and{" "}
          <Link className="underline hover:text-white" href="/resources">
            open mic resources
          </Link>
          .
        </p>
        {featured.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Largest discovery markets</h2>
            <p className="mt-1 text-sm text-white/70">
              Hubs with the most MicStage venues right now—often metros or dense cities.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {featured.map((r) => (
                <Link
                  key={r.key}
                  href={`/locations/${r.slug}/performers`}
                  className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
                >
                  {r.label} ({r.count})
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {queryFailed ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/85">
            We couldn’t load discovery markets. Try again in a moment.
          </div>
        ) : null}

        <LocationsDirectory rows={rows} />
      </main>
    </div>
  );
}
