import Link from "next/link";
import type { Metadata } from "next";
import { AmazonAffiliateLink } from "@/components/resources/AmazonAffiliateLink";
import {
  AMAZON_ASSOCIATES_TRACKING_ID,
  openMicGearByAudience,
  type OpenMicGearItem,
} from "@/lib/amazonAssociates";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open Mic Gear | MicStage resources",
  description:
    "Practical gear recommendations for open mic performers and hosts: mics, stands, cables, portable PA, mixers, and stage essentials — with clear guidance on what matters in a live room.",
  path: "/resources/open-mic-gear",
});

function GearList({ items }: { items: OpenMicGearItem[] }) {
  return (
    <ul className="mt-5 grid gap-5">
      {items.map((item) => (
        <li key={item.category} className="border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
          <h3 className="text-lg font-semibold text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-white/75">{item.guidance}</p>
          <p className="mt-3">
            <AmazonAffiliateLink
              category={item.category}
              searchKeywords={item.searchKeywords}
              className="text-sm font-medium text-[rgb(var(--om-neon))] underline underline-offset-2 hover:brightness-110"
            >
              Browse on Amazon
            </AmazonAffiliateLink>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function OpenMicGearPage() {
  const performers = openMicGearByAudience("performers");
  const hosts = openMicGearByAudience("hosts");

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resources", item: absoluteUrl("/resources") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Open Mic Gear",
        item: absoluteUrl("/resources/open-mic-gear"),
      },
    ],
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

        <div className="text-xs text-white/60">
          <Link href="/resources" className="underline hover:text-white">
            Resources
          </Link>
          {" | "}
          Gear guide
        </div>

        <h1 className="om-heading mt-3 text-4xl tracking-wide">Open Mic Gear</h1>
        <p className="mt-3 text-base text-white/80">
          Useful recommendations for performers and hosts preparing for an open mic. These are category searches —
          not product endorsements — so you can compare options that fit your room, budget, and how often you play.
        </p>
        <p className="mt-3 text-sm leading-6 text-white/65">
          MicStage runs signup and lineup tools; this page is optional reading for people who also need stage
          essentials. Links go to Amazon search results. MicStage is not sponsored or endorsed by Amazon.
        </p>

        <aside
          className="mt-6 rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm leading-6 text-amber-50/90"
          aria-label="Affiliate disclosure"
        >
          <p>
            Affiliate disclosure: MicStage may earn a commission from qualifying purchases.
          </p>
          <p className="mt-2 text-amber-50/75">
            As an Amazon Associate I earn from qualifying purchases.
          </p>
        </aside>

        <section className="mt-10" aria-labelledby="performers-gear">
          <h2 id="performers-gear" className="text-2xl font-semibold text-white">
            Performers
          </h2>
          <p className="mt-2 text-sm text-white/65">
            Pack gear that survives a shared stage: clear vocals into the house mic, cables that work on the first
            try, and small accessories that keep changeovers calm.
          </p>
          <GearList items={performers} />
        </section>

        <section className="mt-12" aria-labelledby="hosts-gear">
          <h2 id="hosts-gear" className="text-2xl font-semibold text-white">
            Hosts / venues
          </h2>
          <p className="mt-2 text-sm text-white/65">
            Reliable house sound and power keep the night moving. Favor simple, durable setups one person can reset
            between performers.
          </p>
          <GearList items={hosts} />
        </section>

        <section className="mt-12 border-t border-white/10 pt-8 text-sm text-white/60">
          <p>
            Tracking ID used on Amazon links on this page:{" "}
            <span className="text-white/80">{AMAZON_ASSOCIATES_TRACKING_ID}</span>. Browse more MicStage guides on{" "}
            <Link href="/resources" className="underline hover:text-white">
              Resources
            </Link>
            , or find a night on{" "}
            <Link href="/find-open-mics" className="underline hover:text-white">
              Find open mics
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
