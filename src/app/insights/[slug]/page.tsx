import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getManagedFeed } from "@/lib/gravyblock-managed";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = (await getManagedFeed())?.items.find((i) => i.slug === slug);
  if (!item) return { title: "Not found", robots: { index: false, follow: false } };
  return { title: { absolute: item.title }, description: item.description ?? item.title, alternates: { canonical: `/insights/${slug}` } };
}

export default async function InsightPage({ params }: Props) {
  const { slug } = await params;
  const item = (await getManagedFeed())?.items.find((i) => i.slug === slug);
  if (!item) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm opacity-60">{new Date(item.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{item.title}</h1>
      <article className="prose mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />
    </main>
  );
}