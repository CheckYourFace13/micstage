import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Discovery & marketing for open mic venues and artists",
  description:
    "How MicStage combines artist discovery, venue pages, and shareable links so your open mic is easier to find without treating marketing as an afterthought.",
  path: "/why/marketing-and-seo",
});

export default function WhyMarketingAndDiscoveryPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-widest text-white/60">Why MicStage works</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">
          Discovery and marketing that stay tied to the real schedule
        </h1>
        <p className="mt-3 text-sm text-white/75">
          MicStage is built so your open mic has a stable page people can return to: address, nights, lineup links, and the same
          URLs you can drop into newsletters, posts, or a flyer QR code.
        </p>

        <section className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">What gets shared and discovered</h2>
          <ul className="grid gap-3 text-sm text-white/75">
            <li>Public venue pages (exact addresses) and metro/regional artist discovery pages.</li>
            <li>
              Stable routes: venue pages plus market-level browsing. Smaller towns roll up until local venue density supports a
              dedicated hub.
            </li>
            <li>Sitemap and robots support for launch-ready discovery.</li>
          </ul>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Why this tends to convert better</h2>
          <p className="text-sm text-white/75">
            People scouting an open mic want timing, address, and format. When that lives on a page that does not move every
            week, your promo links keep working after the post scrolls away.
          </p>
          <p className="text-sm text-white/75">
            In practice, that usually means fewer &quot;is this still the right link?&quot; messages and more repeat visits from people who
            trust the page.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register/venue"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            List your open mic on MicStage
          </Link>
          <Link
            href="/find-open-mics"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Find Local Open Mic&apos;s
          </Link>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 md:hidden">
          <div className="pointer-events-auto rounded-xl border border-[rgba(var(--om-neon),0.5)] bg-black/90 p-3 backdrop-blur">
            <Link
              href="/register/venue"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
            >
              List your open mic on MicStage
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
