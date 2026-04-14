import type { Metadata } from "next";
import Link from "next/link";
import { OpenMicMapClient } from "@/components/map/OpenMicMapClient";
import { loadOpenMicMapVenues } from "@/lib/map/loadOpenMicMapVenues";
import { getPrismaOrNull } from "@/lib/prisma";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic map — browse venues by night & format",
  description:
    "Interactive map of MicStage open mic venues with nights of the week, performance format filters, and links to book. Pan and zoom to explore; list updates with what’s on screen.",
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
        <p className="mt-3 max-w-2xl text-sm text-white/70">
          Explore MicStage venues on a live map. Filter by weekday or performance type, see which nights have online
          booking open, then jump to any venue page to view the full schedule and reserve a slot.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/find-open-mics" className="text-white/70 underline hover:text-white">
            Search by ZIP or city
          </Link>
          <Link href="/locations" className="text-white/70 underline hover:text-white">
            Markets directory
          </Link>
          <Link href="/venues" className="text-white/70 underline hover:text-white">
            All venues A–Z
          </Link>
        </div>

        {loadError ? (
          <div className="mt-8 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90">
            We couldn’t load map data. Try again shortly.
          </div>
        ) : venues.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/15 bg-zinc-900/40 px-4 py-6 text-sm text-white/75">
            <p>No venues with coordinates and a public open mic schedule yet. When venues complete Google Places onboarding, they appear here automatically.</p>
            <p className="mt-3">
              <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
                Find open mics
              </Link>{" "}
              or{" "}
              <Link href="/register/venue" className="text-[rgb(var(--om-neon))] underline">
                add your venue
              </Link>
              .
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
