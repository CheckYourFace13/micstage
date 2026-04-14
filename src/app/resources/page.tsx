import Link from "next/link";
import type { Metadata } from "next";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import type { ResourceArticle } from "@/lib/resourcesContent";
import { getAllResourceArticles } from "@/lib/resourcesContent";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic resources and guides",
  description:
    "Evergreen MicStage guides for venue owners, performers, and local communities: open mic strategy, formats, operations, audience growth, and first-night preparation.",
  path: "/resources",
});

const CATEGORY_LABEL: Record<string, string> = {
  "venue-ops": "Venue operations",
  strategy: "Strategy & platform",
  performer: "Performer perspective",
  community: "Community impact",
};

const CATEGORY_ORDER = ["venue-ops", "strategy", "performer", "community"] as const;

const FEATURED_SLUGS = [
  "what-to-expect-at-your-first-open-mic",
  "how-micstage-helps-venues-and-performers-connect",
  "how-to-run-a-successful-open-mic-night",
  "why-open-mic-nights-work-for-venues",
] as const;

const BROWSE_GOALS: { label: string; slug: string; blurb: string }[] = [
  {
    label: "Run a stronger room",
    slug: "how-to-run-a-successful-open-mic-night",
    blurb: "Scheduling, sign-up, and host workflow",
  },
  {
    label: "Grow repeat visits",
    slug: "open-mics-repeat-visits-customer-loyalty",
    blurb: "Habit, trust, and weeknight loyalty",
  },
  {
    label: "Pick the right format",
    slug: "types-of-open-mic-nights",
    blurb: "Acoustic, comedy, poetry, variety",
  },
  {
    label: "Support your block",
    slug: "how-open-mics-help-neighborhoods",
    blurb: "Neighborhoods and local scenes",
  },
  {
    label: "Performers’ priorities",
    slug: "what-performers-look-for-in-open-mics",
    blurb: "What artists notice first",
  },
  {
    label: "Venue value story",
    slug: "why-open-mic-nights-work-for-venues",
    blurb: "Why weeknight open mics work",
  },
];

function articleBySlug(articles: ResourceArticle[], slug: string): ResourceArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export default function ResourcesIndexPage() {
  const articles = getAllResourceArticles();
  const grouped = new Map<string, ResourceArticle[]>();
  for (const a of articles) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }

  const sortedCategoryEntries = [...grouped.entries()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0] as (typeof CATEGORY_ORDER)[number]) - CATEGORY_ORDER.indexOf(b[0] as (typeof CATEGORY_ORDER)[number]),
  );

  const featured = FEATURED_SLUGS.map((slug) => articleBySlug(articles, slug)).filter(Boolean) as ResourceArticle[];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Resources", item: absoluteUrl("/resources") }],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MicStage open mic guides",
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.title,
      url: absoluteUrl(`/resources/${a.slug}`),
    })),
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
        <h1 className="om-heading text-4xl tracking-wide">Open mic resources</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/70">
          People-first guides for venue teams, hosts, performers, and neighbors. Each article includes practical tips, a short
          FAQ, and links into MicStage discovery so you can go from reading to finding a real room.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/60">
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/find-open-mics">
            Find open mics
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/map">
            Open mic map
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/venues">
            Venue pages
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/locations">
            Locations
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/performers">
            Performers
          </Link>
        </div>

        <section className="mt-10" aria-labelledby="featured-guides">
          <h2 id="featured-guides" className="text-xl font-semibold text-white">
            Start here
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-white/55">
            High-signal guides for first-timers, venue operators, and anyone connecting discovery to a real night out.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {featured.map((a) => (
              <Link
                key={a.slug}
                href={`/resources/${a.slug}`}
                className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 hover:border-emerald-400/40 hover:bg-emerald-950/30"
              >
                <h3 className="font-semibold text-emerald-50">{a.title}</h3>
                <p className="mt-2 text-sm text-white/70">{a.description}</p>
                <div className="mt-3 text-xs text-emerald-200/80">{a.readingMinutes} min read · {CATEGORY_LABEL[a.category]}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="browse-goals">
          <h2 id="browse-goals" className="text-xl font-semibold text-white">
            Browse by goal
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BROWSE_GOALS.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/resources/${g.slug}`}
                  className="block rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                >
                  <span className="font-medium text-white">{g.label}</span>
                  <span className="mt-1 block text-sm text-white/65">{g.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 grid gap-10">
          {sortedCategoryEntries.map(([category, rows]) => (
            <section key={category}>
              <h2 className="text-xl font-semibold">{CATEGORY_LABEL[category] ?? category}</h2>
              <p className="mt-1 text-xs text-white/50">
                {category === "venue-ops"
                  ? "Room logistics, formats, and weeknight programming."
                  : category === "strategy"
                    ? "Retention, operations, and how MicStage fits into discovery."
                    : category === "performer"
                      ? "Preparation, expectations, and how artists evaluate rooms."
                      : "Neighborhood impact and local creative scenes."}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rows.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/resources/${a.slug}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                  >
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{a.description}</p>
                    <div className="mt-3 text-xs text-white/55">{a.readingMinutes} min read</div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
