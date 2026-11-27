import type { Metadata } from "next";
import Link from "next/link";
import { OpenMicMapClient } from "@/components/map/OpenMicMapClient";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";

/** Anonymous map shell — marker data loads from cached JSON, not embedded HTML. */
export const revalidate = 300;

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic map: find venues by night on MicStage",
  description:
    "Map-first discovery for MicStage open mics: filter by weekday and format, see which venues offer online signups, then open any profile to sign up when available. Complements city or ZIP search; it is not a duplicate directory.",
  path: "/map",
});

export default function OpenMicMapPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Map", item: absoluteUrl("/map") }],
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
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
            See where open mics actually happen, not just a list. Filter by the night you want to play, the kind of room
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
              Full venue list
            </Link>
          </div>

          <div className="order-1 md:order-4">
            <div className="rounded-xl ring-1 ring-white/10 md:rounded-none md:ring-0">
              <OpenMicMapClient />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
