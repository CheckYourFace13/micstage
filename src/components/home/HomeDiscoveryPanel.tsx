import Link from "next/link";
import { DiscoveryListingBadge } from "@/components/discovery/DiscoveryListingBadge";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadDiscoveryHomeStats, loadFeaturedPublicListings } from "@/lib/publicListings/queries";
import { listingPublicHref } from "@/lib/publicListings/types";

export async function HomeDiscoveryPanel() {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const [stats, featured] = await Promise.all([
    loadDiscoveryHomeStats(prisma),
    loadFeaturedPublicListings(prisma, { region: "IL", limit: 4 }),
  ]);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 md:mt-8 md:gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-lg font-bold text-white md:text-xl">{stats.verifiedListings}</div>
          <div className="text-[10px] text-white/55 md:text-xs">Verified listings</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-lg font-bold text-white md:text-xl">{stats.bookableVenues}</div>
          <div className="text-[10px] text-white/55 md:text-xs">Bookable venues</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-lg font-bold text-white md:text-xl">{stats.recentlyVerified}</div>
          <div className="text-[10px] text-white/55 md:text-xs">Verified in 30 days</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-lg font-bold text-[rgb(var(--om-neon))] md:text-xl">IL</div>
          <div className="text-[10px] text-white/55 md:text-xs">Launch market</div>
        </div>
      </div>

      {featured.length > 0 ? (
        <div className="mt-6 md:mt-8">
          <h2 className="text-sm font-semibold text-white/90 md:text-base">Open mics in Chicagoland</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {featured.map((l) => (
              <li key={l.id}>
                <Link
                  href={listingPublicHref(l.slug)}
                  className="block rounded-xl border border-white/10 bg-black/30 p-3.5 hover:border-[rgb(var(--om-neon))]/35 hover:bg-black/40 md:p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{l.name}</span>
                    <DiscoveryListingBadge kind="verified" bookable={false} />
                  </div>
                  <p className="mt-1 text-xs text-white/55">
                    {[l.city, l.region].filter(Boolean).join(", ") || l.formattedAddress}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
