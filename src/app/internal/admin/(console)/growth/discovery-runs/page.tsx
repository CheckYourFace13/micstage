import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminGrowthDiscoveryRunsPage() {
  await assertAdminSession();
  const prisma = requirePrisma();
  const runs = await prisma.growthDiscoveryRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      markets: true,
      createdLeads: true,
      duplicateLeads: true,
      skippedLeads: true,
      candidatesTotal: true,
      summary: true,
    },
  });

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Discovery runs</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-2 max-w-3xl text-xs text-zinc-500">
        One row is written when <code className="text-zinc-400">runGrowthLeadDiscovery</code> finishes (cron or scripts). Counts are
        ingest outcomes; <code className="text-zinc-400">candidatesTotal</code> is post-cap candidates handed to ingest (pre-DB
        dedupe). Full per-adapter diagnostics live in <code className="text-zinc-400">summary</code> JSON.
      </p>

      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No runs stored yet. After the next discovery job, rows appear here.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
          <table className="w-full min-w-[960px] text-left text-xs text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Time (UTC)</th>
                <th className="px-3 py-2">Markets</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Dup</th>
                <th className="px-3 py-2">Skip</th>
                <th className="px-3 py-2">Candidates</th>
                <th className="px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/80 align-top">
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{r.createdAt.toISOString()}</td>
                  <td className="max-w-[280px] px-3 py-2 font-mono text-[10px]">{r.markets.join(", ")}</td>
                  <td className="px-3 py-2 text-zinc-200">{r.createdLeads}</td>
                  <td className="px-3 py-2">{r.duplicateLeads}</td>
                  <td className="px-3 py-2">{r.skippedLeads}</td>
                  <td className="px-3 py-2 text-zinc-200">{r.candidatesTotal}</td>
                  <td className="max-w-[480px] px-3 py-2">
                    <details className="cursor-pointer text-[11px]">
                      <summary className="text-emerald-400/90 hover:text-emerald-300">JSON</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">
                        {JSON.stringify(r.summary, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
