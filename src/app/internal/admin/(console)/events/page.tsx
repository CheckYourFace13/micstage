import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function AdminEventsPage(props: {
  searchParams: Promise<{ venueId?: string; page?: string; sort?: string; when?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const venueId = params.venueId?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sortDesc = params.sort !== "asc";
  const when = params.when?.trim() ?? "all";
  const today = startOfTodayUtc();

  const where: Prisma.EventInstanceWhereInput = {};
  if (venueId) {
    where.template = { venueId };
  }
  if (when === "future") {
    where.date = { gte: today };
  } else if (when === "past") {
    where.date = { lt: today };
  }

  const [total, rows, venuesMini] = await Promise.all([
    prisma.eventInstance.count({ where }),
    prisma.eventInstance.findMany({
      where,
      orderBy: { date: sortDesc ? "desc" : "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        date: true,
        isCancelled: true,
        template: {
          select: {
            title: true,
            timeZone: true,
            venue: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { slots: true } },
      },
    }),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const instanceIds = rows.map((r) => r.id);
  const slotStats =
    instanceIds.length === 0
      ? []
      : await prisma.slot.groupBy({
          by: ["instanceId", "status"],
          where: { instanceId: { in: instanceIds } },
          _count: { _all: true },
        });

  function slotLine(iid: string) {
    const parts = slotStats.filter((s) => s.instanceId === iid);
    if (parts.length === 0) return "—";
    return parts.map((p) => `${p.status}:${p._count._all}`).join(" · ");
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Event instances</h1>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-zinc-400">Venue</span>
          <select
            name="venueId"
            defaultValue={venueId ?? ""}
            className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white"
          >
            <option value="">All</option>
            {venuesMini.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-zinc-400">Date order</span>
          <select name="sort" defaultValue={sortDesc ? "desc" : "asc"} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-zinc-400">When (UTC date)</span>
          <select name="when" defaultValue={when} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white">
            <option value="all">All</option>
            <option value="future">Future + today</option>
            <option value="past">Past only</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Apply
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">{total} instances · page {page}</p>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Template</th>
              <th className="px-2 py-2">Cancelled</th>
              <th className="px-2 py-2 text-right">Slots</th>
              <th className="px-2 py-2">By status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.id} className={r.isCancelled ? "opacity-60" : ""}>
                <td className="px-2 py-2 font-mono text-xs">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/events/${r.id}`}>
                    {r.date.toISOString().slice(0, 10)}
                  </Link>
                </td>
                <td className="px-2 py-2 text-xs text-zinc-300">{r.template.venue.name}</td>
                <td className="px-2 py-2 text-xs text-zinc-400">{r.template.title}</td>
                <td className="px-2 py-2 text-xs">{r.isCancelled ? "yes" : "no"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r._count.slots}</td>
                <td className="px-2 py-2 font-mono text-[10px] text-zinc-500">{slotLine(r.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
