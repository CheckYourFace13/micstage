import Link from "next/link";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { DiscoveryListingBadge } from "@/components/discovery/DiscoveryListingBadge";
import { EmptyDiscoveryActions } from "@/components/publicListings/EmptyDiscoveryActions";
import {
  assertKnownLocationSlugOrNotFound,
  canonicalLocationSlugOrNull,
  resolveLocationPlaceTitle,
} from "@/lib/locationSlugValidation";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadDiscoveryMarketOpenMics } from "@/lib/publicListings/discoveryMerge";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { relatedLocationsForLocationSlug } from "@/lib/relatedLocations";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ locationSlug: string }> }): Promise<Metadata> {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  const slug = canonical ?? locationSlug;
  const place = await resolveLocationPlaceTitle(slug);
  return buildPublicMetadata({
    title: `${place} open mics`,
    description: `Browse open mic venues and verified listings in ${place}. Book on MicStage where available, or view schedules and claim pages for unclaimed rooms.`,
    path: `/locations/${slug}/open-mics`,
  });
}

export default async function LocationOpenMicsPage(props: { params: Promise<{ locationSlug: string }> }) {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  if (canonical && canonical !== locationSlug) {
    permanentRedirect(`/locations/${canonical}/open-mics`);
  }
  await assertKnownLocationSlugOrNotFound(locationSlug);
  const placeTitle = await resolveLocationPlaceTitle(locationSlug);

  const prisma = getPrismaOrNull();
  let listings: Awaited<ReturnType<typeof loadDiscoveryMarketOpenMics>> = [];
  let queryFailed = false;

  try {
    if (prisma) {
      listings = await loadDiscoveryMarketOpenMics(prisma, locationSlug);
    }
  } catch (e) {
    console.error("[location open-mics]", locationSlug, e);
    queryFailed = true;
  }

  const bookable = listings.filter((l) => l.bookable);
  const verified = listings.filter((l) => !l.bookable);
  const nearbyLocations = await relatedLocationsForLocationSlug(locationSlug, 6);

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Markets", item: absoluteUrl("/locations") },
      {
        "@type": "ListItem",
        position: 2,
        name: `${placeTitle} open mics`,
        item: absoluteUrl(`/locations/${locationSlug}/open-mics`),
      },
    ],
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Open mics</div>
            <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">{placeTitle} open mics</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Verified listings and bookable MicStage venues in this market. Each card opens a public page with schedule
              info, signup details, and booking when available.
            </p>
          </div>
          <Link className="text-sm text-white/70 hover:text-white" href="/locations">
            All markets
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
            {listings.length} listing{listings.length === 1 ? "" : "s"}
          </span>
          {bookable.length > 0 ? (
            <span className="rounded-md border border-[rgb(var(--om-neon))]/30 bg-[rgba(var(--om-neon),0.08)] px-2 py-1">
              {bookable.length} bookable on MicStage
            </span>
          ) : null}
          <Link
            href={`/locations/${locationSlug}/performers`}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 underline hover:text-white"
          >
            See upcoming artists in {placeTitle}
          </Link>
        </div>

        {queryFailed ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90">
            We could not load listings for this market. Try again shortly.
          </div>
        ) : listings.length === 0 ? (
          <div className="mt-6">
            <EmptyDiscoveryActions context={`market ${locationSlug} empty`} />
          </div>
        ) : (
          <div className="mt-8 grid gap-8">
            {bookable.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Bookable on MicStage</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bookable.map((v) => (
                    <li key={`${v.href}-${v.slug}`}>
                      <Link
                        href={v.href}
                        className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-[rgb(var(--om-neon))]/40 hover:bg-black/45"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{v.name}</span>
                          <DiscoveryListingBadge kind={v.kind} bookable={v.bookable} />
                        </div>
                        <p className="mt-1 text-xs text-white/55">
                          {[v.city, v.region].filter(Boolean).join(", ")}
                        </p>
                        <span className="mt-2 inline-block text-xs text-[rgb(var(--om-neon))] underline">
                          View schedule and book →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {verified.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Verified listings</h2>
                <p className="mt-1 text-xs text-white/55">Not yet managed on MicStage — hosts can claim these pages.</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {verified.map((v) => (
                    <li key={`${v.href}-${v.slug}`}>
                      <Link
                        href={v.href}
                        className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-white/20 hover:bg-black/45"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{v.name}</span>
                          <DiscoveryListingBadge kind={v.kind} bookable={v.bookable} />
                        </div>
                        <p className="mt-1 text-xs text-white/55">
                          {[v.city, v.region].filter(Boolean).join(", ")}
                        </p>
                        <span className="mt-2 inline-block text-xs text-[rgb(var(--om-neon))] underline">
                          View listing →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}

        {nearbyLocations.length > 0 ? (
          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="text-sm font-semibold text-white/80">Nearby markets</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {nearbyLocations.map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}/open-mics`}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  {loc.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="mt-10 text-center text-sm text-white/50">
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
            Search by ZIP or city
          </Link>
          {" · "}
          <Link href="/map" className="underline hover:text-white">
            Open mic map
          </Link>
        </p>
      </main>
    </div>
  );
}
