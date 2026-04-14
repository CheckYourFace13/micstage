import type { Metadata } from "next";
import Link from "next/link";
import { OpenMicMapClient } from "@/components/map/OpenMicMapClient";
import { loadOpenMicMapVenues } from "@/lib/map/loadOpenMicMapVenues";
import { getPrismaOrNull } from "@/lib/prisma";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic map — find venues by night on MicStage",
  description:
    "Map-first discovery for MicStage open mics: filter by weekday and format, see which venues take online bookings soon, then open any profile to reserve a slot. Complements city/ZIP search — not a duplicate directory.",
  path: "/map",
});

export default async function OpenMicMapPage() {
  const prisma = getPrismaOrNull();
  let venues: Awaited<ReturnType<typeof loadOpenMicMapVenues>> = [];
  let loadError = false;

  try {
    if (prisma) {
      venues = await loadOpenMicMapVenues(prisma);
    }
  } catch (e) {
    console.error("[map page] loadOpenMicMapVenues", e);
    loadError = true;
  }

  const itemListLd =
    venues.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Open mic venues on MicStage map",
          numberOfItems: venues.length,
          itemListElement: venues.slice(0, 40).map((v, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: v.name,
            url: absoluteUrl(`/venues/${v.slug}`),
          })),
        }
      : null;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {itemListLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        ) : null}
        <div className="flex flex-col gap-4 md:gap-8">
        <div className="order-2 flex flex-col gap-1.5 md:order-1 md:gap-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/45 md:text-xs md:text-white/55">
            Discovery
          </p>
          <h1 className="om-heading text-[1.65rem] leading-tight tracking-wide sm:text-4xl">Open mic map</h1>
          <p className="text-xs leading-snug text-white/55 md:hidden">
            Filter by night and format, then tap pins for venue pages and booking.
          </p>
        </div>

        <p className="order-4 mt-0 max-w-2xl text-xs leading-snug text-white/55 md:order-2 md:mt-3 md:text-sm md:leading-relaxed md:text-white/70">
          See where open mics actually happen — not just a list. Filter by the night you want to play, the kind of room
          (acoustic, full band, comedy, and more), and whether you can book online right now. Every pin links through to
          the venue&apos;s MicStage page to grab a slot. Recently active MicStage venues without a current public schedule
          still appear so discovery stays broad.
        </p>
        <div className="order-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-white/60 md:order-3 md:gap-x-4 md:gap-y-2 md:text-sm md:text-white/70">
          <Link
            href="/find-open-mics"
            className="text-inherit underline decoration-white/25 underline-offset-2 hover:text-white"
          >
            Search by ZIP or city
          </Link>
          <Link href="/locations" className="text-inherit underline decoration-white/25 underline-offset-2 hover:text-white">
            Markets directory
          </Link>
          <Link href="/venues" className="text-inherit underline decoration-white/25 underline-offset-2 hover:text-white">
            All venues A–Z
          </Link>
        </div>

        {loadError ? (
          <div className="order-1 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-white/90 md:order-4 md:mt-0">
            <p className="font-medium text-amber-50/95">The map couldn&apos;t load venue data.</p>
            <p className="mt-2 text-white/75">Refresh the page in a moment. If this keeps happening, our database may be updating.</p>
          </div>
        ) : venues.length === 0 ? (
          <div className="order-1 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/50 to-zinc-950/80 px-5 py-6 text-sm leading-relaxed text-white/75 md:order-4">
            <p className="font-medium text-white/90">The map is ready — we&apos;re waiting on mappable venues.</p>
            <p className="mt-2">
              Venues appear here once they have map coordinates from Google Places and at least one public open mic
              template. Meanwhile you can still browse by place or list.
            </p>
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/find-open-mics" className="font-semibold text-[rgb(var(--om-neon))] underline">
                Find open mics by location
              </Link>
              <Link href="/register/venue" className="font-semibold text-[rgb(var(--om-neon))] underline">
                List your venue on MicStage
              </Link>
            </p>
          </div>
        ) : (
          <div className="order-1 md:order-4">
            <div className="rounded-xl ring-1 ring-white/10 md:rounded-none md:ring-0">
              <OpenMicMapClient venues={venues} />
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
