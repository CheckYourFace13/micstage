import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import {
  adminDeleteVenuePerformerHistory,
  adminUpdateVenuePerformerHistory,
} from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminPerformerHistoryDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const row = await prisma.venuePerformerHistory.findUnique({
    where: { id },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      musician: { select: { id: true, stageName: true, email: true } },
      linkedMusician: { select: { id: true, stageName: true } },
    },
  });
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link
        href={`/internal/admin/performer-history?venueId=${encodeURIComponent(row.venueId)}`}
        className="text-zinc-500 hover:text-zinc-300"
      >
        ← History ({row.venue.name})
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">Performer history row</h1>
      <p className="font-mono text-xs text-zinc-500">{row.id}</p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Saved.</p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">{decodeURIComponent(params.error)}</p>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-300">
        <p>
          Venue:{" "}
          <Link className="text-sky-400 underline" href={`/internal/admin/venues/${row.venue.id}`}>
            {row.venue.name}
          </Link>
        </p>
        <p className="mt-1 font-mono text-zinc-500">
          kind={row.kind} · key={row.key}
        </p>
        {row.musician ? (
          <p className="mt-2">
            Linked artist:{" "}
            <Link className="text-sky-400 underline" href={`/internal/admin/artists/${row.musician.id}`}>
              {row.musician.stageName}
            </Link>{" "}
            ({row.musician.email})
          </p>
        ) : null}
        {row.linkedMusician ? (
          <p className="mt-1">
            Manual link:{" "}
            <Link className="text-sky-400 underline" href={`/internal/admin/artists/${row.linkedMusician.id}`}>
              {row.linkedMusician.stageName}
            </Link>
          </p>
        ) : null}
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Correct row</h2>
        <p className="text-xs text-zinc-500">
          Adjust display name, public visibility, or use count for data cleanup. Changing counts does not rewrite past
          bookings—use for administrative alignment only.
        </p>
        <form action={adminUpdateVenuePerformerHistory} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Display name</span>
            <input name="displayName" required defaultValue={row.displayName} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Use count (min 1)</span>
            <input
              name="useCount"
              type="number"
              min={1}
              required
              defaultValue={row.useCount}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-zinc-200">
            <input type="checkbox" name="showOnPublicProfile" value="true" defaultChecked={row.showOnPublicProfile} />
            Show on public venue profile (when venue lists past performers)
          </label>
          <button type="submit" className="w-fit rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save
          </button>
        </form>
      </section>

      <section className="mt-8 rounded border border-red-900/50 bg-red-950/20 p-4">
        <h2 className="font-semibold text-red-200">Delete row</h2>
        <p className="text-xs text-zinc-500">
          Removes this history entry only. It does not delete bookings or slots. Type the phrase exactly to confirm.
        </p>
        <form action={adminDeleteVenuePerformerHistory} className="mt-3 grid max-w-lg gap-2">
          <input type="hidden" name="id" value={row.id} />
          <label className="grid gap-1">
            <span className="text-red-300/90">Type DELETE PERFORMER HISTORY to confirm</span>
            <input name="confirmPhrase" autoComplete="off" className="rounded border border-red-800/60 bg-zinc-950 px-2 py-1" />
          </label>
          <button type="submit" className="w-fit rounded border border-red-600/60 bg-red-950/50 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-950/80">
            Delete history row
          </button>
        </form>
      </section>
    </main>
  );
}
