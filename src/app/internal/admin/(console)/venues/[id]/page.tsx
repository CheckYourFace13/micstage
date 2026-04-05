import Link from "next/link";
import { notFound } from "next/navigation";
import { SlotStatus } from "@/generated/prisma/client";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import {
  adminGenerateResetLink,
  adminSendResetEmail,
  adminUpdateVenue,
} from "@/app/internal/admin/actions";

export const dynamic = "force-dynamic";

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function AdminVenueDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; resetSent?: string; resetError?: string; resetLink?: string; linkError?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const today = startOfTodayUtc();

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          email: true,
          registrationContentConsentAt: true,
          registrationContentConsentVersion: true,
        },
      },
      managerAccess: {
        include: { manager: { select: { id: true, email: true } } },
        take: 20,
      },
    },
  });
  if (!venue) notFound();

  const [templateCount, instanceAll, instanceFuture, slotGroup, bookingUpcoming] = await Promise.all([
    prisma.eventTemplate.count({ where: { venueId: id } }),
    prisma.eventInstance.count({ where: { template: { venueId: id } } }),
    prisma.eventInstance.count({
      where: { template: { venueId: id }, isCancelled: false, date: { gte: today } },
    }),
    prisma.slot.groupBy({
      by: ["status"],
      where: { instance: { template: { venueId: id } } },
      _count: { _all: true },
    }),
    prisma.booking.count({
      where: {
        cancelledAt: null,
        slot: {
          instance: { template: { venueId: id }, isCancelled: false, date: { gte: today } },
        },
      },
    }),
  ]);

  const slotLines = Object.values(SlotStatus)
    .map((st) => {
      const g = slotGroup.find((x) => x.status === st);
      return `${st}: ${g?._count._all ?? 0}`;
    })
    .join(" · ");

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 text-sm">
      <Link href="/internal/admin/venues" className="text-zinc-500 hover:text-zinc-300">
        ← Venues
      </Link>
      <h1 className="mt-4 text-lg font-semibold text-white">{venue.name}</h1>
      <p className="font-mono text-xs text-zinc-500">{venue.slug}</p>

      {params.saved ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">
          Saved.
        </p>
      ) : null}
      {params.error ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-red-100">
          {decodeURIComponent(params.error)}
        </p>
      ) : null}
      {params.resetSent ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-emerald-100">
          Reset email sent.
        </p>
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
          <p className="text-xs text-zinc-400">Reset link</p>
          <textarea
            readOnly
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs"
            rows={3}
            defaultValue={decodeURIComponent(params.resetLink)}
          />
        </div>
      ) : null}

      <p className="mt-2 text-xs">
        <Link
          className="text-sky-400 underline hover:text-sky-300"
          href={`/internal/admin/performer-history?venueId=${encodeURIComponent(id)}`}
        >
          Lineup / performer history for this venue
        </Link>
      </p>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4 text-zinc-300">
        <h2 className="font-semibold text-white">Schedule health</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>Templates: {templateCount}</li>
          <li>Event instances (all time): {instanceAll}</li>
          <li>Future instances (from today UTC, not cancelled): {instanceFuture}</li>
          <li>Slots by status: {slotLines}</li>
          <li>Upcoming active bookings (this venue): {bookingUpcoming}</li>
        </ul>
      </section>

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Owner</h2>
        <p className="mt-1 text-zinc-300">{venue.owner.email}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Registration content consent:{" "}
          {venue.owner.registrationContentConsentAt ? (
            <>
              <span className="text-zinc-300">{venue.owner.registrationContentConsentAt.toISOString().slice(0, 19)}Z</span>
              {venue.owner.registrationContentConsentVersion ? (
                <span className="ml-2 font-mono">v{venue.owner.registrationContentConsentVersion}</span>
              ) : null}
            </>
          ) : (
            <span className="text-amber-500/90">not recorded (pre-policy signup)</span>
          )}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <form action={adminSendResetEmail} className="grid gap-2">
            <input type="hidden" name="returnPath" value={`/internal/admin/venues/${id}`} />
            <input type="hidden" name="email" value={venue.owner.email} />
            <input type="hidden" name="accountType" value="VENUE" />
            <button
              type="submit"
              className="rounded bg-sky-800 px-3 py-2 text-xs text-white hover:bg-sky-700"
            >
              Email reset to owner
            </button>
          </form>
          <form action={adminGenerateResetLink} className="grid gap-2">
            <input type="hidden" name="returnPath" value={`/internal/admin/venues/${id}`} />
            <input type="hidden" name="email" value={venue.owner.email} />
            <input type="hidden" name="accountType" value="VENUE" />
            <button type="submit" className="rounded border border-zinc-600 px-3 py-2 text-xs hover:bg-zinc-800">
              Reset link for owner
            </button>
          </form>
        </div>
      </section>

      {venue.managerAccess.length > 0 ? (
        <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
          <h2 className="font-semibold text-white">Managers (sample)</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {venue.managerAccess.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-zinc-300">
                {a.manager.email}
                <form action={adminSendResetEmail} className="inline">
                  <input type="hidden" name="returnPath" value={`/internal/admin/venues/${id}`} />
                  <input type="hidden" name="email" value={a.manager.email} />
                  <input type="hidden" name="accountType" value="VENUE" />
                  <button type="submit" className="text-sky-400 underline">
                    email reset
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-semibold text-white">Edit (safe fields)</h2>
        <form action={adminUpdateVenue} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="id" value={venue.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Name</span>
            <input name="name" required defaultValue={venue.name} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Time zone</span>
            <input
              name="timeZone"
              required
              defaultValue={venue.timeZone}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">About</span>
            <textarea
              name="about"
              rows={4}
              defaultValue={venue.about ?? ""}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-zinc-200 px-3 py-2 font-medium text-zinc-900 hover:bg-white">
            Save
          </button>
        </form>
      </section>

      <p className="mt-6 text-xs text-zinc-600">
        Public page:{" "}
        <a className="text-sky-500 underline" href={`/venues/${venue.slug}`} target="_blank" rel="noreferrer">
          /venues/{venue.slug}
        </a>
      </p>
    </main>
  );
}
