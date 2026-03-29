import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminArtistsPage(props: {
  searchParams: Promise<{ q?: string; sort?: string; order?: string; page?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sortKey = params.sort === "createdAt" ? "createdAt" : params.sort === "email" ? "email" : "stageName";
  const order = params.order === "desc" ? "desc" : "asc";

  const where: Prisma.MusicianUserWhereInput | undefined = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { stageName: { contains: q, mode: "insensitive" } },
        ],
      }
    : undefined;

  const [total, rows] = await Promise.all([
    prisma.musicianUser.count({ where }),
    prisma.musicianUser.findMany({
      where,
      orderBy: { [sortKey]: order },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        stageName: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    }),
  ]);

  function href(o: { sort?: string; order?: string; page?: string }) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("sort", o.sort ?? sortKey);
    p.set("order", o.order ?? order);
    if (o.page) p.set("page", o.page);
    return `/internal/admin/artists?${p.toString()}`;
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Artists</h1>
      <form method="get" className="mt-4 flex flex-wrap gap-2 text-sm">
        <input type="hidden" name="sort" value={sortKey} />
        <input type="hidden" name="order" value={order} />
        <input name="q" defaultValue={q ?? ""} placeholder="email or stage name" className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white" />
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Search
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">{total} accounts · page {page}</p>
      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">
                <Link href={href({ sort: "stageName", order: sortKey === "stageName" && order === "asc" ? "desc" : "asc" })}>
                  Stage name
                </Link>
              </th>
              <th className="px-2 py-2">
                <Link href={href({ sort: "email", order: sortKey === "email" && order === "asc" ? "desc" : "asc" })}>
                  Email
                </Link>
              </th>
              <th className="px-2 py-2 text-right">Bookings</th>
              <th className="px-2 py-2">
                <Link href={href({ sort: "createdAt", order: sortKey === "createdAt" && order === "desc" ? "asc" : "desc" })}>
                  Created
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/artists/${r.id}`}>
                    {r.stageName}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-400">{r.email}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r._count.bookings}</td>
                <td className="px-2 py-2 text-xs text-zinc-500">{r.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
