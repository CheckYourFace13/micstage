import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminBookingsPage(props: {
  searchParams: Promise<{ q?: string; page?: string; cancelled?: string; deleted?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const cancelledOnly = params.cancelled === "1";

  const where: Prisma.BookingWhereInput = {};
  if (cancelledOnly) {
    where.cancelledAt = { not: null };
  }
  if (q) {
    where.OR = [
      { performerName: { contains: q, mode: "insensitive" } },
      { performerEmail: { contains: q, mode: "insensitive" } },
      { musician: { email: { contains: q, mode: "insensitive" } } },
      { musician: { stageName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, activeCount, cancelledCount] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        performerName: true,
        performerEmail: true,
        cancelledAt: true,
        createdAt: true,
        musician: { select: { stageName: true, email: true } },
        slot: {
          select: {
            id: true,
            status: true,
            startMin: true,
            endMin: true,
            instance: {
              select: {
                date: true,
                isCancelled: true,
                template: {
                  select: {
                    title: true,
                    timeZone: true,
                    venue: { select: { name: true, slug: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.booking.count({ where: { cancelledAt: null } }),
    prisma.booking.count({ where: { cancelledAt: { not: null } } }),
  ]);

  function fmtMin(m: number) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Bookings</h1>
      {params.deleted === "1" ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          Booking deleted; slot set to AVAILABLE.
        </p>
      ) : null}
      <p className="mt-1 text-xs text-zinc-500">
        Global totals: {activeCount} active · {cancelledCount} cancelled
      </p>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <input name="q" defaultValue={q ?? ""} placeholder="performer, email, artist…" className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white" />
        <label className="flex items-center gap-1 text-zinc-400">
          <input type="checkbox" name="cancelled" value="1" defaultChecked={cancelledOnly} />
          Cancelled only
        </label>
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Filter
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">{total} match · page {page}</p>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">Performer</th>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Show date</th>
              <th className="px-2 py-2">Slot</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((b) => {
              const ins = b.slot.instance;
              const v = ins.template.venue;
              return (
                <tr key={b.id} className={b.cancelledAt ? "opacity-60" : ""}>
                  <td className="px-2 py-2">
                    <Link className="text-sky-400 hover:underline" href={`/internal/admin/bookings/${b.id}`}>
                      {b.performerName}
                    </Link>
                    {b.musician ? (
                      <div className="text-[10px] text-zinc-500">{b.musician.stageName}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-300">{v.name}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-400">{ins.date.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-500">
                    <Link className="text-sky-400 hover:underline" href={`/internal/admin/slots/${b.slot.id}`}>
                      {fmtMin(b.slot.startMin)}–{fmtMin(b.slot.endMin)}
                    </Link>{" "}
                    ({ins.template.timeZone})
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {b.cancelledAt ? <span className="text-red-400">cancelled</span> : <span className="text-zinc-400">{b.slot.status}</span>}
                    {ins.isCancelled ? <span className="ml-1 text-amber-500">instance off</span> : null}
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">{b.createdAt.toISOString().slice(0, 16)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
