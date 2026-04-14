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
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {itemListLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        ) : null}
        <p className="text-xs font-medium uppercase tracking-widest text-white/55">Discovery</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Open mic map</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          See where open mics actually happen — not just a list. Filter by the night you want to play, the kind of room
          (acoustic, full band, comedy, and more), and whether you can book online right now. Every pin links through to
          the venue&apos;s MicStage page to grab a slot.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/find-open-mics" className="text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white">
            Search by ZIP or city
          </Link>
          <Link href="/locations" className="text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white">
            Markets directory
          </Link>
          <Link href="/venues" className="text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white">
            All venues A–Z
          </Link>
        </div>

        {loadError ? (
          <div className="mt-8 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-white/90">
            <p className="font-medium text-amber-50/95">The map couldn&apos;t load venue data.</p>
            <p className="mt-2 text-white/75">Refresh the page in a moment. If this keeps happening, our database may be updating.</p>
          </div>
        ) : venues.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/50 to-zinc-950/80 px-5 py-6 text-sm leading-relaxed text-white/75">
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
          <div className="mt-8">
            <OpenMicMapClient venues={venues} />
          </div>
        )}
      </main>
    </div>
  );
}
