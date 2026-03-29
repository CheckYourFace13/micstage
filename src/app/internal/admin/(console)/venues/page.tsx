import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function AdminVenuesPage(props: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    order?: string;
    page?: string;
    error?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sortKey = params.sort === "createdAt" ? "createdAt" : "name";
  const order = params.order === "desc" ? "desc" : "asc";

  const where: Prisma.VenueWhereInput | undefined = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { formattedAddress: { contains: q, mode: "insensitive" } },
          { owner: { email: { contains: q, mode: "insensitive" } } },
        ],
      }
    : undefined;

  const [total, rows] = await Promise.all([
    prisma.venue.count({ where }),
    prisma.venue.findMany({
      where,
      orderBy: { [sortKey]: order },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        timeZone: true,
        createdAt: true,
        owner: { select: { email: true } },
        _count: { select: { eventTemplates: true } },
      },
    }),
  ]);

  function href(extra: Record<string, string>) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("sort", extra.sort ?? sortKey);
    p.set("order", extra.order ?? order);
    if (extra.page) p.set("page", extra.page);
    return `/internal/admin/venues?${p.toString()}`;
  }

  const nameNext = sortKey === "name" && order === "asc" ? "desc" : "asc";
  const createdNext = sortKey === "createdAt" && order === "desc" ? "asc" : "desc";

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Venues</h1>
      {params.error ? (
        <p className="mt-2 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {params.error === "missing_id" ? "Missing record." : decodeURIComponent(params.error)}
        </p>
      ) : null}

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="sort" value={sortKey} readOnly />
        <input type="hidden" name="order" value={order} readOnly />
        <label className="grid gap-1">
          <span className="text-zinc-400">Search</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="name, slug, city, owner email…"
            className="min-w-[220px] rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white"
          />
        </label>
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Filter
        </button>
        <Link href="/internal/admin/venues" className="text-zinc-500 underline">
          Clear
        </Link>
        <span className="text-zinc-500">
          {total} total · page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
      </form>

      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 font-medium text-zinc-400">
            <tr>
              <th className="px-2 py-2">
                <Link className="hover:text-white" href={href({ sort: "name", order: nameNext })}>
                  Name
                </Link>
              </th>
              <th className="px-2 py-2">Slug</th>
              <th className="px-2 py-2">City</th>
              <th className="px-2 py-2">TZ</th>
              <th className="px-2 py-2">Owner email</th>
              <th className="px-2 py-2 text-right">Templates</th>
              <th className="px-2 py-2">
                <Link className="hover:text-white" href={href({ sort: "createdAt", order: createdNext })}>
                  Created
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/80">
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/internal/admin/venues/${r.id}`}>
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-400">{r.slug}</td>
                <td className="px-2 py-2 text-zinc-300">{r.city ?? "—"}</td>
                <td className="px-2 py-2 text-xs text-zinc-400">{r.timeZone}</td>
                <td className="px-2 py-2 text-xs text-zinc-300">{r.owner.email}</td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-300">
                  {r._count.eventTemplates}
                </td>
                <td className="px-2 py-2 text-xs text-zinc-500">{r.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        {page > 1 ? (
          <Link
            className="rounded border border-zinc-600 px-3 py-1 hover:bg-zinc-800"
            href={href({ sort: sortKey, order, page: String(page - 1) })}
          >
            Previous
          </Link>
        ) : null}
        {page * PAGE_SIZE < total ? (
          <Link
            className="rounded border border-zinc-600 px-3 py-1 hover:bg-zinc-800"
            href={href({ sort: sortKey, order, page: String(page + 1) })}
          >
            Next
          </Link>
        ) : null}
      </div>
    </main>
  );
}
