import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import { adminDeleteBooking, adminUpdateBooking } from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminBookingDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      musician: { select: { id: true, email: true, stageName: true } },
      slot: {
        include: {
          instance: {
            include: {
              template: {
                include: { venue: { select: { id: true, name: true, slug: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!booking) notFound();

  const v = booking.slot.instance.template.venue;
  const ins = booking.slot.instance;

  function temporalLabel(instanceDate: Date): string {
    const a = instanceDate.toISOString().slice(0, 10);
    const b = new Date().toISOString().slice(0, 10);
    if (a < b) return "Past";
    if (a > b) return "Future";
    return "Today (date)";
  }
  const when = temporalLabel(ins.date);

  function fmtMin(m: number) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  }

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link href="/internal/admin/bookings" className="text-zinc-500 hover:text-zinc-300">
        ← Bookings
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">Booking</h1>
      <p className="text-xs text-zinc-500">
        <span
          className={
            when === "Future"
              ? "font-semibold text-emerald-400"
              : when === "Past"
                ? "font-semibold text-zinc-500"
                : "font-semibold text-amber-400"
          }
        >
          {when}
        </span>
        <span className="ml-2 font-mono">{booking.id}</span>
      </p>
      <p className="mt-2 text-xs">
        <Link className="text-sky-400 underline" href={`/internal/admin/slots/${booking.slot.id}`}>
          Open slot editor
        </Link>
        {" · "}
        <Link className="text-sky-400 underline" href={`/internal/admin/events/${ins.id}`}>
          Open instance
        </Link>
      </p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Saved.</p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">{decodeURIComponent(params.error)}</p>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-zinc-300">
        <h2 className="font-semibold text-white">Context</h2>
        <ul className="mt-2 space-y-1 text-xs">
          <li>
            Venue:{" "}
            <Link className="text-sky-400 underline" href={`/internal/admin/venues/${v.id}`}>
              {v.name}
            </Link>{" "}
            (<span className="font-mono">{v.slug}</span>)
          </li>
          <li>Show date (UTC stored): {ins.date.toISOString().slice(0, 10)}</li>
          <li>Instance cancelled: {ins.isCancelled ? "yes" : "no"}</li>
          <li>
            Slot: {fmtMin(booking.slot.startMin)}–{fmtMin(booking.slot.endMin)} · {booking.slot.status}
          </li>
          <li>Booking cancelled at: {booking.cancelledAt?.toISOString() ?? "—"}</li>
          {booking.musician ? (
            <li>
              Linked artist:{" "}
              <Link className="text-sky-400 underline" href={`/internal/admin/artists/${booking.musician.id}`}>
                {booking.musician.stageName}
              </Link>{" "}
              ({booking.musician.email})
            </li>
          ) : (
            <li>Linked artist: —</li>
          )}
        </ul>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Edit booking</h2>
        <p className="text-xs text-zinc-500">
          Correct performer labels, link/unlink the MicStage artist account (cuid), and mark whether this booking is
          cancelled. Slot times are edited on the slot page.
        </p>
        <form action={adminUpdateBooking} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={booking.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Performer name</span>
            <input name="performerName" required defaultValue={booking.performerName} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Performer email</span>
            <input name="performerEmail" type="email" defaultValue={booking.performerEmail ?? ""} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Linked artist id (MicStage cuid, empty = unlink)</span>
            <input
              name="musicianId"
              defaultValue={booking.musicianId ?? ""}
              placeholder="cuid…"
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Notes</span>
            <textarea name="notes" rows={4} defaultValue={booking.notes ?? ""} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-zinc-200">
            <input type="checkbox" name="bookingCancelled" value="true" defaultChecked={Boolean(booking.cancelledAt)} />
            Booking cancelled (sets timestamp when first checked; uncheck clears)
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save booking
          </button>
        </form>
      </section>

      <section className="mt-8 rounded border border-red-900/50 bg-red-950/20 p-4">
        <h2 className="font-semibold text-red-200">Delete booking (destructive)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Removes the booking row and sets the slot to AVAILABLE. Optional: clear manual lineup label on the slot. Does not
          automatically adjust venue performer history counts—use Lineup history admin if you need that cleanup.
        </p>
        <form action={adminDeleteBooking} className="mt-3 grid max-w-lg gap-2">
          <input type="hidden" name="id" value={booking.id} />
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" name="clearManualLineupLabel" value="true" />
            Also clear manual lineup label on the slot
          </label>
          <label className="grid gap-1">
            <span className="text-red-300/90">Type DELETE BOOKING to confirm</span>
            <input name="confirmPhrase" autoComplete="off" className="rounded border border-red-800/60 bg-zinc-950 px-2 py-1" />
          </label>
          <button type="submit" className="w-fit rounded border border-red-600/60 bg-red-950/50 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-950/80">
            Delete booking
          </button>
        </form>
      </section>
    </main>
  );
}
