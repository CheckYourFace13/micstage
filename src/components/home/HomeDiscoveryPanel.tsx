import Link from "next/link";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadDiscoveryHomeStats } from "@/lib/publicListings/queries";
import { HomeNearYouListings } from "@/components/home/HomeNearYouListings";

export async function HomeDiscoveryPanel() {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const stats = await loadDiscoveryHomeStats(prisma);

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
          <div className="text-lg font-bold text-white md:text-xl">{stats.openSlotsThisWeek}</div>
          <div className="text-[10px] text-white/55 md:text-xs">Open slots this week</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-lg font-bold text-[rgb(var(--om-neon))] md:text-xl">{stats.metroMarkets}</div>
          <div className="text-[10px] text-white/55 md:text-xs">States &amp; regions covered</div>
        </div>
      </div>

      <HomeNearYouListings />

      <p className="mt-4 text-xs text-white/45">
        Stats are nationwide.{" "}
        <Link href="/locations" className="underline hover:text-white/70">
          Browse by your metro →
        </Link>
      </p>
    </>
  );
}
