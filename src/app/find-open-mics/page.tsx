import type { Metadata } from "next";
import Link from "next/link";
import { FindOpenMicsClient } from "@/components/find-open-mics/FindOpenMicsClient";
import { loadOpenMicFinderVenues, loadPublicDiscoveryLocationRows } from "@/lib/discoveryLocationRows";
import { getPrismaOrNull } from "@/lib/prisma";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Find local open mics near you",
  description:
    "Search MicStage open mic venues by your location, ZIP, city, or metro area. See distance-sorted results and open each venue’s public schedule and lineup.",
  path: "/find-open-mics",
});

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

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-medium uppercase tracking-widest text-white/55">Discovery</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Find Local Open Mic&apos;s</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/70">
          Start from where you are, a ZIP code, a city, or a metro. Open any venue to see its public open mic page,
          schedule, and booking board.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/performers" className="text-white/70 underline hover:text-white">
            Find artists (stage names)
          </Link>
          <Link href="/locations" className="text-white/70 underline hover:text-white">
            All markets directory
          </Link>
          <Link href="/venues" className="text-white/70 underline hover:text-white">
            Full venue A–Z list
          </Link>
        </div>

        {loadError ? (
          <div className="mt-8 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90">
            We couldn’t load venue data. Try again shortly.
          </div>
        ) : (
          <FindOpenMicsClient locationRows={locationRows} venues={venues} />
        )}
      </main>
    </div>
  );
}
