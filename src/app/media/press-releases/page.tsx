import Link from "next/link";
import type { Metadata } from "next";
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
          <span className="ml-auto rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90">
            Use browser Print / Save PDF
          </span>
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
              MicStage, the long-awaited open mic platform, announced today that its beta platform officially launched on
              April 20, 2026. Built for today&apos;s local creative economy, MicStage helps venues plan and run open mic nights with
              structured scheduling tools while helping performers and audiences discover meaningful live events in their own
              communities.
            </p>
            <p>
              The platform is designed to solve persistent friction on both sides of the stage. For venues, MicStage provides
              open mic scheduling infrastructure with venue-controlled event windows, slot structures, recurring templates, and
              clear public pages that improve discoverability and simplify communication. For performers, MicStage makes it
              easier to find open mics, compare open mic venues, and secure opportunities aligned with their goals and format.
            </p>
            <p>
              MicStage supports musicians, comedians, poets, spoken-word artists, and multidisciplinary performers who need
              visibility in a fragmented discovery landscape. By centralizing schedules, booking flow, and venue information in
              a dedicated open mic platform, MicStage helps artists focus less on logistics and more on craft, preparation, and
              performance.
            </p>
            <p>
              For audiences, the value is straightforward: easier access to local talent and more reliable ways to discover live
              events. Instead of piecing together scattered social posts, audiences can identify active nights, participating
              venues, and local performers through one cohesive discovery experience.
            </p>
            <p>
              The beta launch reflects MicStage&apos;s long-term commitment to strengthening the local creative ecosystem. Open mic
              nights are not only talent pipelines; they are neighborhood engines that connect businesses, artists, and
              audiences. By improving scheduling clarity, event visibility, and marketing readiness, MicStage helps communities
              sustain inclusive pathways for creative expression and small-venue growth.
            </p>
            <p>
              Additional updates, partner initiatives, and future expansion milestones will be announced through MicStage media
              channels as the platform continues to evolve.
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
              <p>Email: press@micstage.com (placeholder)</p>
              <p>Phone: +1 (000) 000-0000 (placeholder)</p>
              <p>Media page: https://micstage.com/media</p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
