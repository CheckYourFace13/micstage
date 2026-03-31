import Link from "next/link";
import type { Metadata } from "next";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { getAllResourceArticles } from "@/lib/resourcesContent";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic resources and guides",
  description:
    "Evergreen MicStage guides for venue owners, performers, and local communities: open mic strategy, formats, operations, and audience growth.",
  path: "/resources",
});

const CATEGORY_LABEL: Record<string, string> = {
  "venue-ops": "Venue operations",
  strategy: "Strategy",
  performer: "Performer perspective",
  community: "Community impact",
};

export default function ResourcesIndexPage() {
  const articles = getAllResourceArticles();
  const grouped = new Map<string, typeof articles>();
  for (const a of articles) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }

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
          Practical evergreen guides for venues, performers, and communities building stronger open mic nights. Each guide
          connects strategy ideas to MicStage discovery pages and real booking workflows.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/venues">
            Browse venue pages
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/locations">
            Explore locations
          </Link>
          <Link className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:text-white" href="/performers">
            Discover performers
          </Link>
        </div>

        <div className="mt-8 grid gap-8">
          {[...grouped.entries()].map(([category, rows]) => (
            <section key={category}>
              <h2 className="text-xl font-semibold">{CATEGORY_LABEL[category] ?? category}</h2>
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
