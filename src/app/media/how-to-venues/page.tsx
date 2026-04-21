import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaPrintOnQuery } from "@/components/MediaPrintOnQuery";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage How-To for Venues | Open mic operations guide",
  description:
    "MicStage venue guide covering open mic platform setup, venue profile creation, recurring open mic scheduling, performer attraction, and marketing visibility.",
  path: "/media/how-to-venues",
});

export default function MediaHowToVenuesPage() {
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
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 print:max-w-none print:px-0">
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-white/70 print:hidden">
          <Link href="/media" className="underline decoration-white/25 underline-offset-2 hover:text-white">
            Media
          </Link>
          <span>·</span>
          <span>How-To for Venues</span>
          <Link
            href="/media/how-to-venues?pdf=1"
            className="ml-auto rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
          >
            Print / Download PDF
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgb(var(--om-neon))] print:text-black">Venue how-to sheet</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">MicStage How-To Sheet for Venues</h1>
          <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
            A concise guide for venue teams using MicStage as an open mic platform to run cleaner scheduling, increase repeat
            traffic, and improve discoverability across local live events search behavior.
          </p>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">1) What MicStage is</h2>
            <p className="mt-2 text-sm leading-7 text-white/80 print:text-black">
              MicStage is a dedicated open mic platform for open mic venues and performers. It helps venues publish accurate
              schedules, organize slot availability, and present clear event information so audiences and performers can find open
              mics with confidence.
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">2) Why venues should use MicStage</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Reduces scheduling friction with a single source of truth for open mic windows and slots.</li>
              <li>Improves performer trust through transparent booking structure and clear venue information.</li>
              <li>Supports repeat attendance by making weekly nights easy to discover and verify.</li>
              <li>Strengthens marketing visibility with indexable, shareable venue and event pages.</li>
            </ul>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">3) How open mics grow traffic and repeat visits</h2>
            <p className="mt-2 text-sm leading-7 text-white/80 print:text-black">
              Consistent open mic nights create a repeat habit. Performers bring collaborators, audiences return to follow local
              talent, and weeknight traffic becomes more predictable. MicStage supports this loop by making your open mic
              scheduling and lineup visibility easier to trust.
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">4) Sign up your venue</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Go to <strong>Venue Sign Up</strong> on MicStage.</li>
              <li>Create your venue account with an actively monitored email.</li>
              <li>Complete required details so performers and audiences can identify your room quickly.</li>
            </ol>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">5) Create a strong venue profile</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Use a clear venue name and neighborhood/location details.</li>
              <li>Describe format fit (music, comedy, poetry, mixed-performance friendliness).</li>
              <li>Publish practical stage notes (time limits, equipment, check-in expectations).</li>
              <li>Keep profile copy concise, accurate, and regularly updated.</li>
            </ul>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">6) Set event windows, time slots, and recurring schedules</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Create your event template for the recurring open mic night.</li>
              <li>Set a check-in/start window and define slot duration with realistic transition time.</li>
              <li>Publish recurring instances so future dates remain visible to performers.</li>
              <li>Review slot capacity weekly and adjust based on demand and room pacing.</li>
            </ol>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">7) Attract performers consistently</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Keep booking rules transparent and fair from week to week.</li>
              <li>Share your MicStage page as the canonical signup and schedule reference.</li>
              <li>Highlight venue strengths: sound support, audience culture, and format fit.</li>
              <li>Recognize returning performers while staying welcoming to new local talent.</li>
            </ul>
          </section>

          <section className="mt-7 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">8) Discoverability and marketing impact</h2>
            <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
              MicStage helps venues bridge operations and marketing. When your open mic venue has stable schedule data, it is
              easier for performers to find open mics, easier for audiences to plan live events attendance, and easier for your
              team to promote a reliable weekly experience.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
