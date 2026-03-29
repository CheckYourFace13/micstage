import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminAccountsPage(props: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const kind = params.kind === "managers" ? "managers" : "owners";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const whereOwner: Prisma.VenueOwnerWhereInput | undefined = q
    ? { email: { contains: q, mode: "insensitive" } }
    : undefined;
  const whereManager: Prisma.VenueManagerWhereInput | undefined = q
    ? { email: { contains: q, mode: "insensitive" } }
    : undefined;

  if (kind === "owners") {
    const [total, rows] = await Promise.all([
      prisma.venueOwner.count({ where: whereOwner }),
      prisma.venueOwner.findMany({
        where: whereOwner,
        orderBy: { email: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, email: true, createdAt: true, _count: { select: { venues: true } } },
      }),
    ]);
    return (
      <main className="mx-auto max-w-7xl px-3 py-6">
        <h1 className="text-lg font-semibold text-white">Venue accounts</h1>
        <div className="mt-2 flex gap-2 text-sm">
          <span className="font-semibold text-white">Owners</span>
          <span className="text-zinc-600">|</span>
          <Link className="text-zinc-400 hover:text-white" href="/internal/admin/accounts?kind=managers">
            Managers
          </Link>
        </div>
        <form method="get" className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="kind" value="owners" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="email contains…"
            className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white"
          />
          <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
            Search
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">
          {total} owners · page {page}
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2 text-right">Venues</th>
                <th className="px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {rows.map((r) => (
                <tr key={r.id} id={`owner-${r.id}`} className="scroll-mt-24">
                  <td className="px-2 py-2 font-mono text-xs text-zinc-200">{r.email}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r._count.venues}</td>
                  <td className="px-2 py-2 text-xs text-zinc-500">{r.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  const [total, rows] = await Promise.all([
    prisma.venueManager.count({ where: whereManager }),
    prisma.venueManager.findMany({
      where: whereManager,
      orderBy: { email: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        createdAt: true,
        _count: { select: { access: true } },
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-lg font-semibold text-white">Venue accounts</h1>
      <div className="mt-2 flex gap-2 text-sm">
        <Link className="text-zinc-400 hover:text-white" href="/internal/admin/accounts?kind=owners">
          Owners
        </Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-white">Managers</span>
      </div>
      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="kind" value="managers" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="email contains…"
          className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white"
        />
        <button type="submit" className="rounded bg-zinc-200 px-3 py-1 text-zinc-900">
          Search
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        {total} managers · page {page}
      </p>
      <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2 text-right">Venue access rows</th>
              <th className="px-2 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.id} id={`manager-${r.id}`} className="scroll-mt-24">
                <td className="px-2 py-2 font-mono text-xs text-zinc-200">{r.email}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r._count.access}</td>
                <td className="px-2 py-2 text-xs text-zinc-500">{r.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
