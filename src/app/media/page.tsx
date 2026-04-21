import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { MEDIA_CATEGORY_CARDS } from "@/lib/mediaContent";

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage Media Center | Press, brand, and printable guides",
  description:
    "MicStage media and resource center with printable press releases, brand images, and practical how-to sheets for open mic venues, musicians, comedians, poets, and other performers.",
  path: "/media",
});

export default function MediaLandingPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgb(var(--om-neon))]">Media Center</p>
          <h1 className="om-heading mt-2 text-4xl tracking-wide sm:text-5xl">MicStage Media</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">
            Welcome to MicStage&apos;s media and resource center for venues, artists, press, and partners. This section includes
            printable press materials, brand assets, and operational how-to sheets designed to support open mic scheduling,
            performer discovery, and local live events growth.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Open mic platform</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Find open mics</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Open mic scheduling</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Local talent and live events</span>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2" aria-label="Media categories">
          {MEDIA_CATEGORY_CARDS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-[rgb(var(--om-neon))]/45 hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-white sm:text-xl">{item.title}</h2>
                {item.printable ? (
                  <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                    Printable
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/75">{item.description}</p>
              <div className="mt-4 text-sm font-semibold text-[rgb(var(--om-neon))] group-hover:brightness-110">Open section →</div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
