import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import { adminUpdateEventInstance } from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

export default async function AdminEventInstanceDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const instance = await prisma.eventInstance.findUnique({
    where: { id },
    include: {
      template: {
        include: { venue: { select: { id: true, name: true, slug: true } } },
      },
      slots: {
        orderBy: { startMin: "asc" },
        select: {
          id: true,
          startMin: true,
          endMin: true,
          status: true,
          booking: {
            select: { id: true, performerName: true, cancelledAt: true },
          },
        },
      },
    },
  });
  if (!instance) notFound();

  const v = instance.template.venue;

  return (
    <main className="mx-auto max-w-4xl px-3 py-6 text-sm">
      <Link href="/internal/admin/events" className="text-zinc-500 hover:text-zinc-300">
        ← Instances
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">Instance</h1>
      <p className="font-mono text-xs text-zinc-500">{instance.date.toISOString().slice(0, 10)}</p>

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
        <p className="mt-1">
          Template: <Link className="text-sky-400 underline" href={`/internal/admin/templates/${instance.templateId}`}>{instance.template.title}</Link>
        </p>
        <p className="mt-1 text-zinc-500">
          Schedule window (template local): {fmtMin(instance.template.startTimeMin)}–{fmtMin(instance.template.endTimeMin)} · Weekday{" "}
          {instance.template.weekday}
        </p>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Operations</h2>
        <p className="text-xs text-zinc-500">Cancelling an instance affects availability; does not rewrite booked slot times.</p>
        <form action={adminUpdateEventInstance} className="mt-3 flex flex-wrap items-center gap-4">
          <input type="hidden" name="id" value={instance.id} />
          <label className="flex items-center gap-2 text-zinc-200">
            <input type="checkbox" name="isCancelled" value="true" defaultChecked={instance.isCancelled} />
            Instance cancelled
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white">
            Save
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-white">Slots ({instance.slots.length})</h2>
        <div className="mt-2 overflow-x-auto rounded border border-zinc-700">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-2 py-2">Start–end</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {instance.slots.map((s) => (
                <tr key={s.id}>
                  <td className="px-2 py-2 font-mono text-zinc-300">
                    {fmtMin(s.startMin)}–{fmtMin(s.endMin)}
                  </td>
                  <td className="px-2 py-2 text-zinc-400">{s.status}</td>
                  <td className="px-2 py-2">
                    {s.booking ? (
                      <Link className="text-sky-400 underline" href={`/internal/admin/bookings/${s.booking.id}`}>
                        {s.booking.performerName}
                        {s.booking.cancelledAt ? " (cancelled)" : ""}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
