import Link from "next/link";
import type { Metadata } from "next";
import { HomeDiscoveryPanel } from "@/components/home/HomeDiscoveryPanel";
import { buildPublicMetadata } from "@/lib/publicSeo";

const homeTitle = "Find open mics near you | MicStage";

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: homeTitle,
    description:
      "Find open mics near you for music, comedy, and poetry. Check schedules and signup details, or run your open-mic night free — for performers, promoters, and venues.",
    path: "/",
  }),
  title: { absolute: homeTitle },
};

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,45,149,0.32),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute -bottom-56 -left-40 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,45,149,0.12),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,1))]" />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
        <header className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--om-neon))]" />
              Free for performers, promoters &amp; venues
            </div>
            <h1 className="om-heading mt-4 text-4xl leading-[0.95] tracking-wide sm:text-5xl md:text-6xl">
              Find it. Run it.
              <br />
              Perform. Free.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-white/70 md:text-base">
              Discover real open mics near you, manage the schedule, organize performer signups, share your lineup, and keep
              the night moving — in one place. Free for performers, promoters, and venues.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Link
                href="/find-open-mics"
                data-track-event="homepage_cta_find"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black hover:brightness-110"
              >
                Find open mics
              </Link>
              <Link
                href="/host"
                data-track-event="host_cta_click"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/25 bg-white/8 px-6 text-base font-semibold text-white hover:bg-white/15"
              >
                Run your open mic free
              </Link>
            </div>

            <HomeDiscoveryPanel />
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-widest text-white/50">Who it&apos;s for</div>
              <ul className="mt-3 grid gap-3 text-sm">
                <li className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="font-semibold text-white">Performers</p>
                  <p className="mt-1 text-xs text-white/55">Find real open mics and sign up when available.</p>
                  <Link href="/find-open-mics" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[rgb(var(--om-neon))] underline">
                    Find open mics
                  </Link>
                </li>
                <li className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="font-semibold text-white">Hosts</p>
                  <p className="mt-1 text-xs text-white/55">Run all your open mics — even across multiple venues.</p>
                  <Link href="/host" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[rgb(var(--om-neon))] underline">
                    Host an open mic
                  </Link>
                </li>
                <li className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="font-semibold text-white">Venues</p>
                  <p className="mt-1 text-xs text-white/55">Claim your venue and keep your listing accurate.</p>
                  <Link href="/register/venue" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[rgb(var(--om-neon))] underline">
                    Manage my venue
                  </Link>
                </li>
              </ul>
              <div className="mt-3 grid gap-2.5">
                <Link href="/map" className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm hover:bg-black/40">
                  <span className="font-semibold">Open mic map</span>
                </Link>
                <Link
                  href="/compare"
                  className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm hover:bg-black/40"
                >
                  <span className="font-semibold">Compare open mic apps</span>
                </Link>
              </div>
            </div>
          </div>
        </header>
      </main>
    </div>
  );
}
