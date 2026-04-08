import Link from "next/link";
import type { GrowthLeadListFilters } from "@/lib/growth/growthLeadFilters";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import { requirePrisma } from "@/lib/prisma";

const MAX_ROWS = 300;

export async function GrowthLeadsFilteredTable(props: { filters: GrowthLeadListFilters; title?: string }) {
  const prisma = requirePrisma();
  const where = buildGrowthLeadWhere(props.filters);

  const rows = await prisma.growthLead.findMany({
    where,
    orderBy: [{ fitScore: "desc" }, { createdAt: "desc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      name: true,
      leadType: true,
      status: true,
      city: true,
      suburb: true,
      discoveryMarketSlug: true,
      contactEmailNormalized: true,
      contactUrl: true,
      fitScore: true,
      performanceTags: true,
      source: true,
      createdAt: true,
      openMicSignalTier: true,
      contactQuality: true,
      acquisitionStage: true,
    },
  });

  return (
    <div className="mt-4 overflow-x-auto">
      {props.title ? <h2 className="text-base font-medium text-white">{props.title}</h2> : null}
      <p className="mt-1 text-xs text-zinc-500">
        {rows.length} row{rows.length === 1 ? "" : "s"} (max {MAX_ROWS}). Venue priority leads may auto-advance to send in
        ACTIVE markets; all sends remain throttled via existing marketing caps.
      </p>
      <table className="mt-3 w-full min-w-[1040px] text-left text-xs text-zinc-400">
        <thead>
          <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2 pr-2">Suburb / city</th>
            <th className="py-2 pr-2">Market</th>
            <th className="py-2 pr-2">Contact</th>
            <th className="py-2 pr-2">Fit</th>
            <th className="py-2 pr-2">OM tier</th>
            <th className="py-2 pr-2">Contact Q</th>
            <th className="py-2 pr-2">Acq.</th>
            <th className="py-2 pr-2">Tags</th>
            <th className="py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-800/80">
              <td className="py-2 pr-2">
                <Link className="text-emerald-400 hover:text-emerald-300" href={`/internal/admin/growth/leads/${r.id}`}>
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-2 text-zinc-300">{r.leadType}</td>
              <td className="py-2 pr-2 text-zinc-200">{r.status}</td>
              <td className="py-2 pr-2">
                {[r.suburb, r.city].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="py-2 pr-2 font-mono text-[10px]">{r.discoveryMarketSlug ?? "—"}</td>
              <td className="py-2 pr-2 font-mono text-[10px]">
                {r.contactEmailNormalized ?? r.contactUrl ?? "—"}
              </td>
              <td className="py-2 pr-2">{r.fitScore ?? "—"}</td>
              <td className="py-2 pr-2 font-mono text-[10px]">{r.openMicSignalTier ?? "—"}</td>
              <td className="py-2 pr-2 font-mono text-[10px]">{r.contactQuality ?? "—"}</td>
              <td className="py-2 pr-2 font-mono text-[10px]">{r.acquisitionStage}</td>
              <td className="py-2 pr-2">{r.performanceTags.join(", ") || "—"}</td>
              <td className="py-2">{r.source ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No leads match filters.</p> : null}
    </div>
  );
}
