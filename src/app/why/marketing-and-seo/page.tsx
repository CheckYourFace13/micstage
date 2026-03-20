import Link from "next/link";

export const metadata = {
  title: "Marketing and SEO for open mic venues and artists",
  description:
    "MicStage combines artist discovery, venue pages, and SEO-ready routing so your local open mic can attract more performers, fans, and repeat traffic.",
  alternates: {
    canonical: "https://micstage.com/why/marketing-and-seo",
  },
};

export default function WhyMarketingAndSeoPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-widest text-white/60">Why MicStage works</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">
          Marketing + SEO built into every venue workflow
        </h1>
        <p className="mt-3 text-sm text-white/75">
          MicStage is designed to market your venue and artists automatically: clear pages, consistent location routing,
          and easy-to-share links that search engines can crawl.
        </p>

        <section className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">What gets indexed and shared</h2>
          <ul className="grid gap-3 text-sm text-white/75">
            <li>Public venue pages and city/location performer pages.</li>
            <li>Structured route paths for location-based discovery (city slugs and venue slugs).</li>
            <li>Sitemap and robots support for cleaner crawling and launch readiness.</li>
          </ul>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Why this converts better</h2>
          <p className="text-sm text-white/75">
            People searching for local open mics care about clear timing, venue identity, and who is performing. When
            those details live on stable public pages, your promotion becomes cumulative instead of one-off social
            posts.
          </p>
          <p className="text-sm text-white/75">
            In practical terms: better click confidence, more direct traffic, and stronger repeat discovery for both
            venues and artists.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register/venue"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Start marketing your venue with MicStage
          </Link>
          <Link
            href="/performers"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Browse artist discovery pages
          </Link>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 md:hidden">
          <div className="pointer-events-auto rounded-xl border border-[rgba(var(--om-neon),0.5)] bg-black/90 p-3 backdrop-blur">
            <Link
              href="/register/venue"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
            >
              Start marketing your venue on MicStage
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
