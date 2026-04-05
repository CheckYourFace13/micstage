import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingRestrictionMode, SlotStatus } from "@/generated/prisma/client";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import { adminUpdateSlot } from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

const BOOKING_RESTRICTION_INHERIT = "INHERIT";

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

function temporalLabel(instanceDate: Date): string {
  const a = instanceDate.toISOString().slice(0, 10);
  const b = new Date().toISOString().slice(0, 10);
  if (a < b) return "Past";
  if (a > b) return "Future";
  return "Today (date)";
}

export default async function AdminSlotDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: {
      booking: {
        select: { id: true, performerName: true, cancelledAt: true },
      },
      instance: {
        include: {
          template: {
            include: { venue: { select: { id: true, name: true, slug: true } } },
          },
        },
      },
    },
  });
  if (!slot) notFound();

  const v = slot.instance.template.venue;
  const ins = slot.instance;
  const when = temporalLabel(ins.date);

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link href={`/internal/admin/events/${ins.id}`} className="text-zinc-500 hover:text-zinc-300">
        ← Instance
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">Slot</h1>
      <p className="mt-1 text-xs text-zinc-500">
        <span
          className={
            when === "Future"
              ? "text-emerald-400"
              : when === "Past"
                ? "text-zinc-500"
                : "text-amber-400"
          }
        >
          {when}
        </span>
        {" · "}
        {ins.date.toISOString().slice(0, 10)} · {v.name}
      </p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Saved.</p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">{decodeURIComponent(params.error)}</p>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-300">
        <p>
          Venue:{" "}
          <Link className="text-sky-400 underline" href={`/internal/admin/venues/${v.id}`}>
            {v.name}
          </Link>
        </p>
        <p className="mt-1 font-mono">Slot id: {slot.id}</p>
        {slot.booking ? (
          <p className="mt-2">
            Booking:{" "}
            <Link className="text-sky-400 underline" href={`/internal/admin/bookings/${slot.booking.id}`}>
              {slot.booking.performerName}
            </Link>
            {slot.booking.cancelledAt ? " (cancelled)" : ""}
          </p>
        ) : (
          <p className="mt-2 text-zinc-500">No booking on this slot.</p>
        )}
      </section>

      <section className="mt-6 rounded border border-amber-700/40 bg-amber-950/20 p-4">
        <h2 className="font-semibold text-amber-100">Edit slot</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Changing times can break uniqueness (one row per start time per night). You cannot set status to AVAILABLE while a
          booking exists—delete the booking from the booking admin page first.
        </p>
        <form action={adminUpdateSlot} className="mt-4 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={slot.id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-zinc-400">Start (min from midnight)</span>
              <input
                name="startMin"
                type="number"
                required
                defaultValue={slot.startMin}
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">End (min from midnight)</span>
              <input
                name="endMin"
                type="number"
                required
                defaultValue={slot.endMin}
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
              />
            </label>
          </div>
          <p className="text-[10px] text-zinc-600">
            Local window for this night is typically {fmtMin(slot.instance.template.startTimeMin)}–
            {fmtMin(slot.instance.template.endTimeMin)} ({slot.instance.template.timeZone}).
          </p>
          <label className="grid gap-1">
            <span className="text-zinc-400">Status</span>
            <select name="status" defaultValue={slot.status} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1">
              {Object.values(SlotStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Manual lineup label (empty clears)</span>
            <input
              name="manualLineupLabel"
              defaultValue={slot.manualLineupLabel ?? ""}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Booking restriction override</span>
            <select
              name="bookingRestrictionModeOverride"
              defaultValue={slot.bookingRestrictionModeOverride ?? BOOKING_RESTRICTION_INHERIT}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            >
              <option value={BOOKING_RESTRICTION_INHERIT}>Inherit from template</option>
              {Object.values(BookingRestrictionMode).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Restriction hours before (empty = clear override)</span>
            <input
              name="restrictionHoursBeforeOverride"
              type="number"
              min={0}
              defaultValue={slot.restrictionHoursBeforeOverride ?? ""}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">On-premise max distance (meters, empty = clear)</span>
            <input
              name="onPremiseMaxDistanceMetersOverride"
              type="number"
              min={0}
              defaultValue={slot.onPremiseMaxDistanceMetersOverride ?? ""}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save slot
          </button>
        </form>
      </section>
    </main>
  );
}
