import Link from "next/link";
import type { Metadata } from "next";
import { HomeDiscoveryPanel } from "@/components/home/HomeDiscoveryPanel";
import { buildPublicMetadata } from "@/lib/publicSeo";

const homeTitle = "Find open mics near you | MicStage";

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: homeTitle,
    description:
      "Find open mics near you — verified listings, bookable venues, and a map built for your local scene. MicStage helps performers find a slot and helps hosts claim their room.",
    path: "/",
  }),
  title: { absolute: homeTitle },
};

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,45,149,0.35),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute -bottom-56 -left-40 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle_at_center,rgba(123,97,255,0.28),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,1))]" />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
        <header className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--om-neon))]" />
              Local open mic discovery
            </div>
            <h1 className="om-heading mt-4 text-4xl leading-[0.95] tracking-wide sm:text-5xl md:text-6xl">
              Find open mics
              <br />
              near you
            </h1>
            <p className="mt-4 max-w-xl text-sm text-white/70 md:text-base">
              Browse verified listings in your area, book slots where venues use MicStage, and claim your room if you
              run the mic.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Link
                href="/find-open-mics"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black hover:brightness-110"
              >
                Find a slot tonight
              </Link>
              <Link
                href="/register/venue"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/25 bg-white/8 px-6 text-base font-semibold text-white hover:bg-white/15"
              >
                List or claim your open mic
              </Link>
            </div>

            <HomeDiscoveryPanel />
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-widest text-white/50">Explore</div>
              <div className="mt-3 grid gap-2.5">
                <Link href="/map" className="rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40">
                  <div className="font-semibold">Open mic map</div>
                  <div className="mt-1 text-xs text-white/55">Filter by night — listings and bookable venues near you</div>
                </Link>
                <Link href="/locations" className="rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40">
                  <div className="font-semibold">Browse by metro</div>
                  <div className="mt-1 text-xs text-white/55">Your city, state, and regional hubs</div>
                </Link>
                <Link href="/performers" className="rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40">
                  <div className="font-semibold">Find artists</div>
                  <div className="mt-1 text-xs text-white/55">See who is booking slots near you</div>
                </Link>
              </div>
            </div>
          </div>
        </header>
      </main>
    </div>
  );
}
