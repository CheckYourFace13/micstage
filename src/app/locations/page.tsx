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
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        {rows.length > 0 ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        ) : null}
        <h1 className="om-heading text-[1.65rem] leading-tight tracking-wide sm:text-4xl">Open mic discovery by market</h1>
        <p className="mt-1.5 text-xs leading-snug text-white/55 md:hidden">
          Search hubs below—venue addresses stay exact on each profile.
        </p>

        <div className="mt-3 flex flex-col gap-4 md:mt-6 md:gap-8">
          <div className="order-1 md:order-2">
            <div className="rounded-xl ring-1 ring-white/10 md:rounded-none md:ring-0">
              <LocationsDirectory rows={rows} />
            </div>
          </div>

          <div className="order-2 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 md:order-1 md:gap-4 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0">
            <p className="max-w-2xl text-xs leading-relaxed text-white/55 md:text-sm md:text-white/70">
              Browse metro and regional hubs—not every small town gets its own directory page yet. When a place has fewer than{" "}
              <span className="text-white/85">{MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY}</span> MicStage venues, we group it into a
              broader market (for example Chicagoland or Central Illinois) so discovery is easier. Addresses on each venue page
              stay exact.
            </p>
            <div className="flex flex-wrap gap-2 text-[10px] text-white/50 md:text-xs md:text-white/60">
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">{rows.length} discovery markets</span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
                {rows.reduce((sum, r) => sum + r.count, 0)} venue profiles
              </span>
            </div>
            <p className="text-xs leading-snug text-white/50 md:text-sm md:leading-normal md:text-white/65">
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
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
                <h2 className="text-base font-semibold md:text-lg">Largest discovery markets</h2>
                <p className="mt-1 text-xs text-white/55 md:text-sm md:text-white/70">
                  Hubs with the most MicStage venues right now—often metros or dense cities.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {featured.map((r) => (
                    <Link
                      key={r.key}
                      href={`/locations/${r.slug}/performers`}
                      className="inline-flex min-h-9 items-center rounded-md border border-white/15 bg-black/25 px-2.5 py-1 text-xs hover:bg-black/40 md:min-h-0 md:px-3 md:py-1.5 md:text-sm"
                    >
                      {r.label} ({r.count})
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {queryFailed ? (
              <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/85">
                We couldn’t load discovery markets. Try again in a moment.
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
