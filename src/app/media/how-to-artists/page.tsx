import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaPrintOnQuery } from "@/components/MediaPrintOnQuery";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage How-To for Artists | Performer guide",
  description:
    "MicStage artist guide covering profile setup, how to find open mics, compare open mic venues, book slots, and improve performer visibility.",
  path: "/media/how-to-artists",
});

export default function MediaHowToArtistsPage() {
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
          <span>How-To for Artists</span>
          <Link
            href="/media/how-to-artists?pdf=1"
            className="ml-auto rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
          >
            Print / Download PDF
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgb(var(--om-neon))] print:text-black">Artist how-to sheet</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">MicStage How-To Sheet for Artists</h1>
          <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
            A practical guide for musicians, comedians, poets, and other performers using MicStage to find open mics, book
            opportunities, and improve local visibility.
          </p>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">1) What MicStage is</h2>
            <p className="mt-2 text-sm leading-7 text-white/80 print:text-black">
              MicStage is an open mic platform that connects performers to open mic venues with clear schedule and booking
              information. It is built to reduce uncertainty so you can spend more time preparing your set and less time chasing
              fragmented details.
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">2) Find open mics that fit your act</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Use MicStage discovery pages to find open mics by location and venue type.</li>
              <li>Review event timing, slot format, and room profile before committing.</li>
              <li>Match your style to the venue environment for a better audience response.</li>
            </ul>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">3) Create your artist profile</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Sign up with a consistent performer name or stage name.</li>
              <li>Add profile details that help venues and audiences understand your work.</li>
              <li>Keep your primary genre/format clear (music, comedy, poetry, spoken word, or mixed).</li>
              <li>Update profile text as your material and goals evolve.</li>
            </ol>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">4) Find venues and book slots</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Compare open mic venues using publicly visible scheduling information.</li>
              <li>Choose dates and times that align with your preparation timeline.</li>
              <li>Book available slots early for high-demand recurring nights.</li>
              <li>Track confirmations and arrival timing to avoid missed opportunities.</li>
            </ol>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">5) Improve visibility as a performer</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Use a complete profile so venue operators can evaluate fit quickly.</li>
              <li>Show up consistently to recurring open mic nights to build recognition.</li>
              <li>Engage professionally with hosts, venue staff, and fellow performers.</li>
              <li>Share your upcoming appearances to bring audiences and support local talent.</li>
            </ul>
          </section>

          <section className="mt-7 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">6) MicStage for comedians, musicians, poets, and multidisciplinary acts</h2>
            <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
              MicStage supports a broad creative ecosystem. Whether you perform songs, stand-up, spoken word, storytelling, or a
              hybrid format, you can use MicStage to identify welcoming rooms, locate recurring opportunities, and build momentum
              through dependable live events participation.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
