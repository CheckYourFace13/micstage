import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagedFeed } from "@/lib/gravyblock-managed";

export const revalidate = 60;
export const metadata = { title: "Insights", robots: { index: false, follow: true } };

export default async function InsightsIndex() {
  const items = (await getManagedFeed())?.items ?? [];
  if (items.length === 0) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
      <ul className="mt-8 space-y-4">
        {items.map((i) => (
          <li key={i.slug}>
            <Link href={`/insights/${i.slug}`} className="text-lg font-semibold underline">
              {i.title}
            </Link>
            {i.description ? <p className="text-sm opacity-70">{i.description}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}