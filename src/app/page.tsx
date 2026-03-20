import Link from "next/link";

export const metadata = {
  title: "MicStage",
  description: "Open mic scheduling, performer discovery, and marketing-ready SEO pages.",
  alternates: {
    canonical: "https://micstage.com/",
  },
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

      <main className="relative mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
        <header className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--om-neon))]" />
              Built for local scenes
            </div>
            <h1 className="om-heading mt-4 text-5xl leading-[0.9] tracking-wide sm:text-6xl">
              Put your open mic on the map.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
              We help you <span className="text-white/90">market venues and artists</span>: structured open mic schedules,
              bookable slots, and public pages tuned for discovery. Built-in SEO gives you clean titles, shareable URLs, and
              content Google can index—so marketing and search work together, not as an afterthought.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/register/musician"
                className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(255,45,149,0.25)] hover:brightness-110"
              >
                Artists: Register
              </a>
              <a
                href="/register/venue"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Venues: Register
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="text-xs font-medium uppercase tracking-widest text-white/60">Start here</div>
              <div className="mt-3 grid gap-3">
                <a
                  href="/register/musician"
                  className="group rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Find Open Mics Near You</div>
                      <div className="mt-1 text-sm text-white/70">Claim a slot, share your set time, build momentum.</div>
                    </div>
                    <div className="text-white/60 group-hover:text-white">→</div>
                  </div>
                </a>
                <a
                  href="/register/venue"
                  className="group rounded-xl border border-white/10 bg-black/30 p-4 hover:bg-black/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">For Venues: Create Your Open Mic</div>
                      <div className="mt-1 text-sm text-white/70">
                        Define slots once. We generate marketing-ready public pages (SEO-friendly) for your room.
                      </div>
                    </div>
                    <div className="text-white/60 group-hover:text-white">→</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-14 grid gap-3 text-sm text-white/70 md:grid-cols-3">
          <Link
            href="/why/venue-controlled-structure"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Venue-controlled structure</div>
            <div className="mt-1">Set your day/time, slot length, breaks. The schedule generates itself.</div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              Learn why this drives bookings and visibility →
            </div>
          </Link>
          <Link
            href="/why/no-double-booking"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Booking that doesn’t double-book</div>
            <div className="mt-1">Slots lock when reserved. (Rules + waitlists come next.)</div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              See how dependable bookings build trust →
            </div>
          </Link>
          <Link
            href="/why/marketing-and-seo"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-white/10"
          >
            <div className="font-semibold text-white">Marketing + SEO built in</div>
            <div className="mt-1">
              Indexable venue and schedule pages support your outreach; SEO is part of the product, not a bolt-on.
            </div>
            <div className="mt-3 inline-flex text-sm text-[rgb(var(--om-neon))] hover:brightness-110">
              Read how this helps venues and artists get found →
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}

