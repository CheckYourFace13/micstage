import { SlotStatus } from "@/generated/prisma/client";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgoUtc(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function LaunchMetricsPage() {
  const prisma = getPrismaOrNull();
  const today = startOfTodayUtc();
  const weekAgo = daysAgoUtc(7);

  let venueCount = 0;
  let musicianCount = 0;
  let bookingTotal = 0;
  let upcomingBookings = 0;
  let availableSlots = 0;
  let bookingsCreatedLast7d = 0;
  let venuesCreatedLast7d = 0;
  let musiciansCreatedLast7d = 0;
  let loadError = false;

  if (prisma) {
    try {
      const results = await Promise.all([
        prisma.venue.count(),
        prisma.musicianUser.count(),
        prisma.booking.count(),
        prisma.booking.count({
          where: {
            cancelledAt: null,
            slot: {
              instance: {
                isCancelled: false,
                date: { gte: today },
              },
            },
          },
        }),
        prisma.slot.count({
          where: {
            status: SlotStatus.AVAILABLE,
            instance: {
              isCancelled: false,
              date: { gte: today },
            },
          },
        }),
        prisma.booking.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.venue.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.musicianUser.count({ where: { createdAt: { gte: weekAgo } } }),
      ]);
      [
        venueCount,
        musicianCount,
        bookingTotal,
        upcomingBookings,
        availableSlots,
        bookingsCreatedLast7d,
        venuesCreatedLast7d,
        musiciansCreatedLast7d,
      ] = results;
    } catch {
      loadError = true;
    }
  } else {
    loadError = true;
  }

  const rows: { label: string; value: string }[] = [
    { label: "Venues (total)", value: String(venueCount) },
    { label: "Artist accounts (total)", value: String(musicianCount) },
    { label: "Bookings (all time)", value: String(bookingTotal) },
    { label: "Upcoming active bookings", value: String(upcomingBookings) },
    { label: "Open slots (from today, future instances)", value: String(availableSlots) },
  ];

  const activity: { label: string; value: string }[] = [
    { label: "New bookings (created, last 7 days)", value: String(bookingsCreatedLast7d) },
    { label: "New venues (last 7 days)", value: String(venuesCreatedLast7d) },
    { label: "New artist accounts (last 7 days)", value: String(musiciansCreatedLast7d) },
  ];

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-200/80">Internal</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Launch metrics</h1>
        <p className="mt-2 text-sm text-white/60">
          Read-only counts for launch health. No emails, names, or venue slugs. Unlock with{" "}
          <code className="rounded bg-white/10 px-1">MICSTAGE_LAUNCH_METRICS_SECRET</code> (
          <code className="rounded bg-white/10 px-1">?key=…</code> sets a 7-day cookie).
        </p>

        {loadError ? (
          <p className="mt-8 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            Database unavailable or query failed — counts may be zero. Check{" "}
            <code className="rounded bg-black/30 px-1">DATABASE_URL</code> and logs.
          </p>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/45">Totals</h2>
          <dl className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-white/70">{r.label}</dt>
                <dd className="font-mono text-white tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/45">Recent activity (aggregates)</h2>
          <dl className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
            {activity.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-white/70">{r.label}</dt>
                <dd className="font-mono text-white tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-10 text-xs text-white/40">
          “Upcoming” uses instance dates stored as UTC midnight for the local show date, compared from today’s UTC
          midnight — good enough for a coarse launch dashboard.
        </p>
      </main>
    </div>
  );
}
