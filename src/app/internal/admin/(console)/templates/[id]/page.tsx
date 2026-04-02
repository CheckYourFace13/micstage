import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import { adminUpdateEventTemplate } from "@/app/internal/admin/actions";
import { performanceFormatLabel } from "@/lib/venueDisplay";

export const dynamic = "force-dynamic";

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

export default async function AdminTemplateDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const t = await prisma.eventTemplate.findUnique({
    where: { id },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      _count: { select: { instances: true } },
    },
  });
  if (!t) notFound();

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link href="/internal/admin/templates" className="text-zinc-500 hover:text-zinc-300">
        ← Templates
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">{t.title}</h1>
      <p className="text-xs text-zinc-500">
        <Link className="text-sky-400 underline" href={`/internal/admin/venues/${t.venue.id}`}>
          {t.venue.name}
        </Link>{" "}
        · {t.weekday} · {fmtMin(t.startTimeMin)}–{fmtMin(t.endTimeMin)} · slot {t.slotMinutes}m / break {t.breakMinutes}m · {t.timeZone}
      </p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">Saved.</p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">{decodeURIComponent(params.error)}</p>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-400">
        <p>Performance format: {performanceFormatLabel(t.performanceFormat)}</p>
        <p className="mt-2">Instances generated: {t._count.instances}</p>
        <p className="mt-2">
          Times and slot grid are not editable here (booking safety). Adjust title, description, and public visibility only.
        </p>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Edit (safe fields)</h2>
        <form action={adminUpdateEventTemplate} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={t.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Title</span>
            <input name="title" required defaultValue={t.title} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Description</span>
            <textarea name="description" rows={4} defaultValue={t.description ?? ""} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" name="isPublic" value="true" defaultChecked={t.isPublic} />
            Public template
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save
          </button>
        </form>
      </section>
    </main>
  );
}
