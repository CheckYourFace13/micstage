import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 80;

export default async function AdminPerformerHistoryPage(props: {
  searchParams: Promise<{ venueId?: string; page?: string; deleted?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const venueId = params.venueId?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.VenuePerformerHistoryWhereInput = venueId ? { venueId } : {};

  const [total, rows, venuesMini] = await Promise.all([
    prisma.venuePerformerHistory.count({ where }),
    prisma.venuePerformerHistory.findMany({
      where,
      orderBy: [{ venueId: "asc" }, { lastUsedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        displayName: true,
        useCount: true,
        lastUsedAt: true,
        showOnPublicProfile: true,
        venue: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Lineup / performer history</h1>
      <p className="mt-1 max-w-2xl text-xs text-zinc-500">
        Deduplicated names from lineups (linked artists and manual entries). Edit labels or counts for corrections; delete
        rows to remove bad test data. Prefer venue-scoped filters to avoid accidental broad review.
      </p>
      {params.deleted === "1" ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          History row deleted.
        </p>
      ) : null}

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-zinc-400">Venue</span>
          <select
            name="venueId"
            defaultValue={venueId ?? ""}
            className="max-w-xs rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white"
          >
            <option value="">All (first {PAGE_SIZE} rows)</option>
            {venuesMini.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Apply
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        {total} rows · page {page}
        {!venueId ? " · Select a venue to narrow results." : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Kind</th>
              <th className="px-2 py-2 text-right">Uses</th>
              <th className="px-2 py-2">Last used</th>
              <th className="px-2 py-2">Public</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2 text-xs text-zinc-400">{r.venue.name}</td>
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/performer-history/${r.id}`}>
                    {r.displayName}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono text-[10px] text-zinc-500">{r.kind}</td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{r.useCount}</td>
                <td className="px-2 py-2 font-mono text-[10px] text-zinc-500">{r.lastUsedAt.toISOString().slice(0, 16)}</td>
                <td className="px-2 py-2 text-xs">{r.showOnPublicProfile ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
