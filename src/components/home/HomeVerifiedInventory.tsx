import Link from "next/link";
import type { HomepageVerifiedListing } from "@/lib/publicListings/homepageVerified";

export function HomeVerifiedInventory({ listings }: { listings: HomepageVerifiedListing[] }) {
  if (listings.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="explore-verified-open-mics">
      <h2 id="explore-verified-open-mics" className="text-sm font-semibold text-white/90 md:text-base">
        Explore verified open mics
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {listings.map((l) => {
          const bits = [l.city, l.scheduleLabel, l.formatLabel].filter(Boolean);
          return (
            <li key={l.slug}>
              <Link
                href={`/open-mics/${l.slug}`}
                className="block rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 hover:border-[rgb(var(--om-neon))]/40 hover:bg-black/45"
              >
                <span className="block text-sm font-semibold text-white">{l.name}</span>
                {bits.length > 0 ? (
                  <span className="mt-0.5 block text-xs text-white/55">{bits.join(" · ")}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
