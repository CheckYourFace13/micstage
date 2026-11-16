import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { FindOpenMicsClient } from "@/components/find-open-mics/FindOpenMicsClient";
import { FinderVerifiedFallback } from "@/components/find-open-mics/FinderVerifiedFallback";
import { loadPublicDiscoveryLocationRows } from "@/lib/discoveryLocationRows";
import { hasGoogleMapsBrowserKey } from "@/lib/env/publicGoogleMaps.server";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadHomepageVerifiedOpenMics } from "@/lib/publicListings/homepageVerified";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const findTitle = "Find Open Mics Near You | Music, Comedy & Poetry";
/** Match hub index gate: only redirect to SSR city hubs with enough inventory. */
const FINDER_HUB_REDIRECT_MIN = 5;

type FindOpenMicsSearchParams = { q?: string | string[] };

function firstQueryValue(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

function hubSlugForFinderQuery(
  q: string,
  rows: { slug: string; label: string; count: number }[],
): string | null {
  const raw = q.trim().toLowerCase();
  if (raw.length < 2) return null;
  const qSlug = slugify(raw);
  const strong = rows.filter((r) => r.count >= FINDER_HUB_REDIRECT_MIN);
  const bySlug = strong.find((r) => r.slug === qSlug || r.slug.startsWith(`${qSlug}-`));
  if (bySlug) return bySlug.slug;
  const byLabel = strong.find((r) => {
    const label = r.label.toLowerCase();
    return label === raw || label.startsWith(`${raw},`) || label.startsWith(`${raw} `);
  });
  return byLabel?.slug ?? null;
}

export async function generateMetadata(props: {
  searchParams: Promise<FindOpenMicsSearchParams>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const hasQuery = Boolean(firstQueryValue(sp.q));
  return {
    ...buildPublicMetadata({
      title: findTitle,
      description:
        "Find open mic nights near you for music, comedy, poetry and more. Search by city or ZIP, see schedules, and check signup details before you go.",
      path: "/find-open-mics",
      // Query-string finder shells are thin duplicates of /locations/[slug]/open-mics hubs.
      index: !hasQuery,
    }),
    title: { absolute: `${findTitle} | MicStage` },
  };
}

export default async function FindOpenMicsPage(props: {
  searchParams: Promise<FindOpenMicsSearchParams>;
}) {
  const prisma = getPrismaOrNull();
  let locationRows: Awaited<ReturnType<typeof loadPublicDiscoveryLocationRows>> = [];
  let fallback: Awaited<ReturnType<typeof loadHomepageVerifiedOpenMics>> = [];
  let loadError = false;
  const sp = await props.searchParams;
  const q = firstQueryValue(sp.q);

  try {
    if (prisma) {
      [locationRows, fallback] = await Promise.all([
        loadPublicDiscoveryLocationRows(prisma),
        loadHomepageVerifiedOpenMics(prisma, 12),
      ]);
    }
  } catch (e) {
    console.error("find-open-mics load", e);
    loadError = true;
  }

  if (q && !loadError) {
    const hub = hubSlugForFinderQuery(q, locationRows);
    if (hub) permanentRedirect(`/locations/${hub}/open-mics`);
  }

  const showGooglePlaceSuggestions = hasGoogleMapsBrowserKey();

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 md:gap-8">
          <div className="order-2 flex flex-col gap-1.5 md:order-1 md:gap-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/45 md:text-xs md:text-white/55">
              Discovery
            </p>
            <h1 className="om-heading text-[1.65rem] leading-tight tracking-wide sm:text-4xl">
              Find Open Mics Near You
            </h1>
            <p className="text-xs leading-snug text-white/55 md:hidden">
              Search by city or ZIP. See nearby open mics, schedules, type, and signup details when available.
            </p>
          </div>

          <p className="order-4 max-w-2xl text-xs leading-snug text-white/55 md:order-2 md:mt-3 md:text-sm md:leading-normal md:text-white/70">
            Find open mic nights near you for music, comedy, poetry and more. Search by city or ZIP, see schedules, and
            check signup details before you go.
          </p>
          <div className="order-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-white/60 md:order-3 md:gap-3 md:gap-y-2 md:text-sm md:text-white/70">
            <Link href="/locations" className="text-inherit underline hover:text-white">
              Browse by city
            </Link>
            <Link href="/map" className="text-inherit underline hover:text-white">
              Open mic map
            </Link>
            <Link href="/performers" className="text-inherit underline hover:text-white">
              Find artists
            </Link>
            <Link href="/venues" className="text-inherit underline hover:text-white">
              Full venue list
            </Link>
            <Link href="/resources" className="text-inherit underline hover:text-white">
              Resources and guides
            </Link>
            <Link href="/register/venue" className="text-inherit underline hover:text-white">
              List your venue
            </Link>
          </div>

          {loadError ? (
            <div className="order-1 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90 md:order-4">
              We could not load venue data. Try again shortly.
            </div>
          ) : (
            <div className="order-1 md:order-4">
              <div className="rounded-xl ring-1 ring-white/10 md:rounded-none md:ring-0">
                <FindOpenMicsClient
                  locationRows={locationRows}
                  showGooglePlaceSuggestions={showGooglePlaceSuggestions}
                />
              </div>
              <FinderVerifiedFallback listings={fallback} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
