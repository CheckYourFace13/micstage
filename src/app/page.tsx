import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";

const homeTitle = "MicStage — Find open mics, book slots, grow your room";

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: homeTitle,
    description:
      "Find local open mics, book a slot, and help your venue get discovered. MicStage is free for artists and venues—schedules, bookings, and public pages that make marketing easier.",
    path: "/",
  }),
  /** Avoid root layout `title.template` appending "| MicStage" twice. */
  title: { absolute: homeTitle },
};

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,45,149,0.35),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute -bottom-56 -left-40 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle_at_center,rgba(123,97,255,0.28),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute -bottom-52 -right-44 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),rgba(0,0,0,0)_60%)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,1))]" />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--om-neon))]" />
                Open mics near you
              </div>
              <div className="inline-flex items-center rounded-full border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-3 py-1 text-xs font-medium text-white/85">
                Free · Built for venues &amp; artists
              </div>
            </div>
            <h1 className="om-heading mt-4 text-4xl leading-[0.95] tracking-wide sm:text-5xl md:text-6xl">
              Find open mics.
              <br />
              Fill the room.
            </h1>
            <p className="mt-4 max-w-xl text-base font-medium leading-snug text-white/85 sm:text-lg">
              MicStage helps people discover local open mics and helps venues run a clear schedule with bookable slots.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/find-open-mics"
                className="inline-flex h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(255,45,149,0.25)] hover:brightness-110"
              >
                Find Local Open Mic&apos;s
              </Link>
              <Link
                href="/register/musician"
                className="inline-flex h-12 items-center justify-center rounded-md border-2 border-white/25 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/15"
              >
                Artists: Sign Up
              </Link>
              <Link
                href="/register/venue"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10"
              >
                Venues: Sign Up
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/50">
              Already have an account?{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/login/musician">
                Artist login
              </Link>
              {" · "}
              <Link className="underline hover:text-white" href="/login/venue">
                Venue login
              </Link>
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="text-xs font-medium uppercase tracking-widest text-white/60">Also on MicStage</div>
              <div className="mt-3 grid gap-3">
                <Link
                  href="/performers"
                  className="group rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Find artists by stage name</div>
                      <div className="mt-1 text-sm text-white/65">Search the public artist directory.</div>
                    </div>
                    <span className="text-white/50 group-hover:text-white">→</span>
                  </div>
                </Link>
                <Link
                  href="/locations"
                  className="group rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Browse by metro &amp; region</div>
                      <div className="mt-1 text-sm text-white/65">Markets and roll-up hubs for discovery.</div>
                    </div>
                    <span className="text-white/50 group-hover:text-white">→</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-16 max-w-3xl text-sm leading-relaxed text-white/65">
          <h2 className="text-base font-semibold text-white/90">How MicStage helps</h2>
          <p className="mt-2">
            Venues get structured open mic nights, shareable lineup links, and public pages that make marketing and
            discovery easier—clear titles, stable URLs, and content people (and search) can actually use. Artists get a
            simple way to find rooms and reserve spots. Most venues can publish a first schedule in a few guided steps.
          </p>
        </section>

        <section className="mt-10 grid gap-3 text-sm text-white/70 md:grid-cols-3">
          <Link
            href="/why/venue-controlled-structure"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Venue-controlled structure</div>
            <div className="mt-1">Set day/time and slot length—the schedule builds itself.</div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              Learn more →
            </div>
          </Link>
          <Link
            href="/why/no-double-booking"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Booking that doesn’t double-book</div>
            <div className="mt-1">Slots lock when reserved.</div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              Learn more →
            </div>
          </Link>
          <Link
            href="/why/marketing-and-seo"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Discovery &amp; marketing built in</div>
            <div className="mt-1">Show up where people are searching—without a separate “website project.”</div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              Learn more →
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}
