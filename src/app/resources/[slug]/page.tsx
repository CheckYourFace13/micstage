import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { getAllResourceArticles, getResourceArticleBySlug } from "@/lib/resourcesContent";

export function generateStaticParams() {
  return getAllResourceArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const article = getResourceArticleBySlug(slug);
  if (!article) {
    return buildPublicMetadata({
      title: "Resource not found",
      description: "This MicStage resource page could not be found.",
      path: `/resources/${slug}`,
    });
  }
  return {
    ...buildPublicMetadata({
      title: `${article.title} | MicStage resources`,
      description: article.description,
      path: `/resources/${article.slug}`,
    }),
    openGraph: {
      ...(buildPublicMetadata({
        title: `${article.title} | MicStage resources`,
        description: article.description,
        path: `/resources/${article.slug}`,
      }).openGraph ?? {}),
      type: "article",
    },
  };
}

export default async function ResourceArticlePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const article = getResourceArticleBySlug(slug);
  if (!article) notFound();

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: "MicStage" },
    publisher: {
      "@type": "Organization",
      name: "MicStage",
      logo: { "@type": "ImageObject", url: absoluteUrl("/favicon.png") },
    },
    mainEntityOfPage: absoluteUrl(`/resources/${article.slug}`),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resources", item: absoluteUrl("/resources") },
      { "@type": "ListItem", position: 2, name: article.title, item: absoluteUrl(`/resources/${article.slug}`) },
    ],
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

        <div className="text-xs text-white/60">
          <Link href="/resources" className="underline hover:text-white">
            Resources
          </Link>
          {" · "}
          {article.readingMinutes} min read
        </div>
        <h1 className="om-heading mt-3 text-4xl tracking-wide">{article.title}</h1>
        <p className="mt-3 text-base text-white/80">{article.intro}</p>

        <div className="mt-8 grid gap-8">
          {article.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-2xl font-semibold">{s.heading}</h2>
              <div className="mt-3 grid gap-3 text-sm leading-6 text-white/80">
                {s.paragraphs.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Key takeaways</h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-white/80">
            {article.keyTakeaways.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Explore MicStage discovery pages</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {article.relatedDiscoveryLinks.map((l) => (
              <Link
                key={`${article.slug}-${l.href}-${l.label}`}
                href={l.href}
                className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
