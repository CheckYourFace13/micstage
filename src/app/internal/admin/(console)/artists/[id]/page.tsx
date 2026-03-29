import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import {
  adminGenerateResetLink,
  adminSendResetEmail,
  adminUpdateMusician,
} from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function AdminArtistDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    resetSent?: string;
    resetError?: string;
    resetLink?: string;
    linkError?: string;
  }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const today = startOfTodayUtc();

  const artist = await prisma.musicianUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      stageName: true,
      bio: true,
      createdAt: true,
    },
  });
  if (!artist) notFound();

  const [bookingTotal, upcoming] = await Promise.all([
    prisma.booking.count({ where: { musicianId: id } }),
    prisma.booking.count({
      where: {
        musicianId: id,
        cancelledAt: null,
        slot: { instance: { isCancelled: false, date: { gte: today } } },
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link href="/internal/admin/artists" className="text-zinc-500 hover:text-zinc-300">
        ← Artists
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">{artist.stageName}</h1>
      <p className="font-mono text-xs text-zinc-400">{artist.email}</p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Saved.</p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">
          {decodeURIComponent(params.error)}
        </p>
      ) : null}
      {params.resetSent ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Reset email sent.</p>
      ) : null}
      {params.resetError ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">
          {decodeURIComponent(params.resetError)}
        </p>
      ) : null}
      {params.linkError ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">
          {decodeURIComponent(params.linkError)}
        </p>
      ) : null}
      {params.resetLink ? (
        <div className="mt-3 rounded border border-zinc-600 bg-zinc-900 p-2">
          <textarea
            readOnly
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs"
            rows={3}
            defaultValue={decodeURIComponent(params.resetLink)}
          />
        </div>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-zinc-300">
        <h2 className="font-semibold text-white">Booking counts</h2>
        <ul className="mt-2 text-xs">
          <li>All bookings (as musician): {bookingTotal}</li>
          <li>Upcoming active (from today UTC): {upcoming}</li>
        </ul>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Password reset</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <form action={adminSendResetEmail}>
            <input type="hidden" name="returnPath" value={`/internal/admin/artists/${id}`} />
            <input type="hidden" name="email" value={artist.email} />
            <input type="hidden" name="accountType" value="MUSICIAN" />
            <button type="submit" className="rounded bg-sky-800 px-3 py-2 text-xs text-white hover:bg-sky-700">
              Send reset email
            </button>
          </form>
          <form action={adminGenerateResetLink}>
            <input type="hidden" name="returnPath" value={`/internal/admin/artists/${id}`} />
            <input type="hidden" name="email" value={artist.email} />
            <input type="hidden" name="accountType" value="MUSICIAN" />
            <button type="submit" className="rounded border border-zinc-600 px-3 py-2 text-xs hover:bg-zinc-800">
              Generate link
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Edit (safe fields)</h2>
        <form action={adminUpdateMusician} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={artist.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Stage name</span>
            <input
              name="stageName"
              required
              defaultValue={artist.stageName}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Bio</span>
            <textarea
              name="bio"
              rows={5}
              defaultValue={artist.bio ?? ""}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save
          </button>
        </form>
      </section>
    </main>
  );
}
