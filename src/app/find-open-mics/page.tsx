import type { Metadata } from "next";
import Link from "next/link";
import { FindOpenMicsClient } from "@/components/find-open-mics/FindOpenMicsClient";
import { loadOpenMicFinderVenues, loadPublicDiscoveryLocationRows } from "@/lib/discoveryLocationRows";
import { hasGoogleMapsBrowserKey } from "@/lib/env/publicGoogleMaps.server";
import { getPrismaOrNull } from "@/lib/prisma";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

const findTitle = "Find Open Mics Near You | Music, Comedy & Poetry";

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: findTitle,
    description:
      "Find open mic nights near you for music, comedy, poetry and more. Search by city or ZIP, see schedules, and check signup details before you go.",
    path: "/find-open-mics",
  }),
  title: { absolute: `${findTitle} | MicStage` },
};

export default async function FindOpenMicsPage() {
  const prisma = getPrismaOrNull();
  let locationRows: Awaited<ReturnType<typeof loadPublicDiscoveryLocationRows>> = [];
  let venues: Awaited<ReturnType<typeof loadOpenMicFinderVenues>> = [];
  let loadError = false;

  try {
    if (prisma) {
      [locationRows, venues] = await Promise.all([
        loadPublicDiscoveryLocationRows(prisma),
        loadOpenMicFinderVenues(prisma),
      ]);
    }
  } catch (e) {
    console.error("find-open-mics load", e);
    loadError = true;
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
                  venues={venues}
                  showGooglePlaceSuggestions={showGooglePlaceSuggestions}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
