import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Venue-controlled open mic schedules that scale",
  description:
    "Define recurring open mic structure once on MicStage, generate bookable slots, and publish indexable venue pages for search and shareable discovery.",
  path: "/why/venue-controlled-structure",
});

export default function WhyVenueControlledStructurePage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-widest text-white/60">Why MicStage works</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">
          Venue-controlled structure that sells your room
        </h1>
        <p className="mt-3 text-sm text-white/75">
          Most open mic discovery is fragmented: old social posts, outdated flyers, and no reliable schedule source.
          MicStage puts the venue in control of a single source of truth so artists and audiences can find accurate
          events.
        </p>

        <section className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">How it works</h2>
          <ul className="grid gap-3 text-sm text-white/75">
            <li>
              Define recurring event structure once: weekday, times, slot length, and booking window.
            </li>
            <li>Generate date schedules in minutes instead of rebuilding event pages every week.</li>
            <li>
              Publish a stable venue URL with consistent event details that can be indexed and shared.
            </li>
          </ul>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Why this helps you signups and traffic</h2>
          <p className="text-sm text-white/75">
            Structured venue pages improve discoverability for searches like “open mic near me,” “open mic in [metro or
            region],” and “[venue name] open mic schedule.” When your listing is clear and updated, artists trust the page,
            click-through improves, and repeat attendance becomes easier.
          </p>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.06)] p-6">
          <h2 className="text-lg font-semibold text-white">On-site booking lock (phone proximity)</h2>
          <p className="text-sm text-white/75">
            Venues can enforce “book on site only.” In this mode, MicStage checks the artist’s phone location against
            the venue location before allowing the reservation. This keeps remote no-shows from grabbing spots and helps
            protect fairness for people physically at the event.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register/venue"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Create your venue account
          </Link>
          <Link
            href="/venues"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Browse public venue pages
          </Link>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 md:hidden">
          <div className="pointer-events-auto rounded-xl border border-[rgba(var(--om-neon),0.5)] bg-black/90 p-3 backdrop-blur">
            <Link
              href="/register/venue"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
            >
              Start with venue-controlled scheduling
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
