"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";

const FINDER_HUB_REDIRECT_MIN = 5;

type Row = { slug: string; label: string; count: number };

function hubSlugForFinderQuery(q: string, rows: Row[]): string | null {
  const raw = q.trim().toLowerCase();
  if (raw.length < 2) return null;
  const qSlug = slugify(raw);
  const strong = rows.filter((r) => r.count >= FINDER_HUB_REDIRECT_MIN);
  const bySlug = strong.find((r) => r.slug === qSlug || r.slug.startsWith(`${qSlug}-`));
  if (bySlug) return bySlug.slug;
  const byLabel = strong.find((r) => {
    const label = r.label.toLowerCase();
    return label === raw || label.startsWith(`${raw},`) || label.startsWith(`${raw} `);
  });
  return byLabel?.slug ?? null;
}

/** Keeps the finder HTML shell cacheable — hub redirects run in the browser. */
export function FinderHubRedirect(props: { locationRows: Row[] }) {
  const router = useRouter();
  const { locationRows } = props;

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
      if (!q) return;
      const hub = hubSlugForFinderQuery(q, locationRows);
      if (hub) router.replace(`/locations/${hub}/open-mics`);
    } catch {
      // ignore
    }
  }, [locationRows, router]);

  return null;
}
