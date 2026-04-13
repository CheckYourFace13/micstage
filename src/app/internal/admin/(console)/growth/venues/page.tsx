import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  GROWTH_LEADS_PAGE_SIZE_DEFAULT,
  GrowthLeadsFilteredTable,
} from "@/app/internal/admin/(console)/growth/_components/GrowthLeadsFilteredTable";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import { defaultGrowthMetro, primaryLaunchDiscoveryMarketSlug, resolveGrowthMarketSlug } from "@/lib/growth/marketsConfig";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function AdminGrowthVenuesPage(props: {
  searchParams: Promise<{ market?: string; metro?: string; all?: string; page?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const market = resolveGrowthMarketSlug({ market: params.market, metro: params.metro });
  const pipelineOnly = params.all !== "1";
  const filters = { marketSlug: market, leadType: "VENUE" as const, pipelineOnly };
  const where = buildGrowthLeadWhere(filters);
  const totalCount = await prisma.growthLead.count({ where });
  const page = parsePage(params.page);
  const pageSize = GROWTH_LEADS_PAGE_SIZE_DEFAULT;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const baseQuery: Record<string, string | undefined> = { market };
  if (params.all === "1") baseQuery.all = "1";

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Venues to contact</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Defaults to <strong className="text-zinc-300">{defaultGrowthMetro().label}</strong> when no market is set. Prefer{" "}
        <Link className="text-emerald-400 hover:text-emerald-300" href="/internal/admin/growth/leads">
          filtered leads
        </Link>{" "}
        for full filters.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-zinc-500">Discovery market slug</span>
          <input
            name="market"
            defaultValue={market}
            placeholder={primaryLaunchDiscoveryMarketSlug()}
            className="h-9 min-w-[12rem] rounded border border-zinc-700 bg-black/40 px-2 font-mono text-xs text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" name="all" value="1" defaultChecked={params.all === "1"} />
          Show all statuses
        </label>
        <button type="submit" className="h-9 rounded-md bg-zinc-700 px-3 text-white hover:bg-zinc-600">
          Apply
        </button>
      </form>

      <GrowthLeadsFilteredTable
        filters={filters}
        title="Venue leads"
        totalCount={totalCount}
        page={safePage}
        pageSize={pageSize}
        baseQuery={baseQuery}
      />
    </main>
  );
}
