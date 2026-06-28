import { getPrismaOrNull } from "@/lib/prisma";
import { loadDiscoveryInventoryStats } from "@/lib/publicListings/inventoryStats";

export async function DiscoveryInventorySummary(props: { className?: string }) {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const stats = await loadDiscoveryInventoryStats(prisma);
  const cls = props.className ?? "";

  return (
    <div className={`flex flex-wrap gap-2 text-[10px] text-white/50 md:text-xs md:text-white/60 ${cls}`}>
      <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
        {stats.totalListings} open mic listing{stats.totalListings === 1 ? "" : "s"}
      </span>
      <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
        {stats.bookableVenues} bookable MicStage venue{stats.bookableVenues === 1 ? "" : "s"}
      </span>
      <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
        {stats.verifiedListings} verified listing{stats.verifiedListings === 1 ? "" : "s"}
      </span>
      <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
        {stats.discoveryMarkets} discovery market{stats.discoveryMarkets === 1 ? "" : "s"}
      </span>
    </div>
  );
}
