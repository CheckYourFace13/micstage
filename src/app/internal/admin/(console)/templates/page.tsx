import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function AdminTemplatesPage(props: {
  searchParams: Promise<{ q?: string; venueId?: string; page?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const venueId = params.venueId?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.EventTemplateWhereInput = {};
  if (venueId) where.venueId = venueId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { venue: { name: { contains: q, mode: "insensitive" } } },
      { venue: { slug: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.eventTemplate.count({ where }),
    prisma.eventTemplate.findMany({
      where,
      orderBy: [{ venue: { name: "asc" } }, { weekday: "asc" }, { startTimeMin: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        weekday: true,
        startTimeMin: true,
        endTimeMin: true,
        slotMinutes: true,
        breakMinutes: true,
        timeZone: true,
        venue: { select: { id: true, name: true, slug: true } },
        _count: { select: { instances: true } },
      },
    }),
  ]);

  const venuesMini = await prisma.venue.findMany({
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, name: true, slug: true },
  });

  function fmtMin(m: number) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Event templates</h1>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-zinc-400">Search</span>
          <input name="q" defaultValue={q ?? ""} placeholder="title, venue…" className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white" />
        </label>
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
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Filter
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">{total} templates · page {page}</p>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">Venue</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Weekday</th>
              <th className="px-2 py-2">Window</th>
              <th className="px-2 py-2 text-right">Instances</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/venues/${t.venue.id}`}>
                    {t.venue.name}
                  </Link>
                </td>
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/templates/${t.id}`}>
                    {t.title}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono text-xs">{t.weekday}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-400">
                  {fmtMin(t.startTimeMin)}–{fmtMin(t.endTimeMin)} · slot {t.slotMinutes}m · br {t.breakMinutes}m · {t.timeZone}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{t._count.instances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
