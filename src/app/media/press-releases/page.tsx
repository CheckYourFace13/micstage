import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaPrintOnQuery } from "@/components/MediaPrintOnQuery";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { PRESS_RELEASE_META } from "@/lib/mediaContent";

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage Press Releases | Open mic platform media announcements",
  description:
    "Official MicStage press releases with launch updates on the open mic platform for venues, musicians, comedians, poets, and local live events communities.",
  path: "/media/press-releases",
});

export default function MediaPressReleasesPage() {
  return (
    <div className="min-h-dvh bg-black text-white print:bg-white print:text-black">
      <Suspense fallback={null}>
        <MediaPrintOnQuery />
      </Suspense>
      <style>{`
        @media print {
          header, footer { display: none !important; }
        }
      `}</style>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <div className="media-no-print mb-5 flex flex-wrap items-center gap-3 text-sm text-white/70 print:hidden">
          <Link href="/media" className="underline decoration-white/25 underline-offset-2 hover:text-white">
            Media
          </Link>
          <span>·</span>
          <span>Press Releases</span>
          <Link
            href="/media/press-releases?pdf=1"
            className="ml-auto rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
          >
            Print / Download PDF
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgb(var(--om-neon))] print:text-black">
            Press Release
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{PRESS_RELEASE_META.headline}</h1>
          <p className="mt-3 text-base leading-7 text-white/80 print:text-black">{PRESS_RELEASE_META.subheadline}</p>
          <p className="mt-4 border-t border-white/15 pt-4 text-sm font-medium text-white/85 print:border-black/30 print:text-black">
            {PRESS_RELEASE_META.releaseLine}
          </p>

          <div className="mt-6 grid gap-4 text-sm leading-7 text-white/85 print:text-black">
            <p>
              MicStage announced today that its open mic platform entered public beta on April 20, 2026. The product helps venues
              publish recurring schedules and bookable slots, helps performers find rooms that fit their act, and gives audiences a
              single place to confirm nights, times, and lineups.
            </p>
            <p>
              For venues, MicStage is built around venue-controlled templates: event windows, slot length, recurring nights, and
              public pages that stay in sync with the live board artists book against. For performers, it reduces guesswork: search
              and map flows point to the same schedule the room is running.
            </p>
            <p>
              MicStage supports musicians, comedians, poets, spoken-word artists, and mixed-format rooms. Centralized schedules
              and booking status mean less back-and-forth in inboxes and comment threads, and more time on stage prep.
            </p>
            <p>
              For audiences, the pitch is simple: fewer “is it happening?” dead ends. When a venue keeps MicStage updated, fans can
              trust the date-specific lineup link the same way performers do.
            </p>
            <p>
              Open mics are weeknight infrastructure for a lot of small venues. MicStage is built to support that work with clearer
              scheduling, steadier discovery, and marketing-friendly public URLs venues can reuse week after week.
            </p>
            <p>
              Additional updates and milestones will ship through MicStage&apos;s normal product channels as the beta continues.
            </p>
          </div>

          <section className="mt-8 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">Boilerplate</h2>
            <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
              MicStage is an open mic platform built to help venues run structured open mic scheduling and help performers find
              open mics with confidence. The platform supports open mic venues, musicians, comedians, poets, and local creative
              communities through better discovery, clearer booking flow, and practical marketing visibility for recurring live
              events.
            </p>
          </section>

          <section className="mt-8 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">Media Contact</h2>
            <div className="mt-3 space-y-1 text-sm text-white/80 print:text-black">
              <p>MicStage Communications</p>
              <p>Media page: https://micstage.com/media</p>
              <p className="hidden print:block">Email: drummer@micstage.com</p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
