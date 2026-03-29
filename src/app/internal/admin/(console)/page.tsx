import { assertAdminSession, getOptionalAdminEmailFromLoginForm } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";
import {
  adminGenerateResetLink,
  adminSendResetEmail,
} from "@/app/internal/admin/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function AdminOverviewPage(props: {
  searchParams: Promise<{
    saved?: string;
    lookup?: string;
    resetSent?: string;
    resetError?: string;
    resetLink?: string;
    linkError?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();
  const today = startOfTodayUtc();
  const opEmail = await getOptionalAdminEmailFromLoginForm();

  let venueCount = 0;
  let artistCount = 0;
  let ownerCount = 0;
  let managerCount = 0;
  let bookingTotal = 0;
  let upcomingBookings = 0;
  let templateCount = 0;
  let futureInstanceCount = 0;
  let slotFutureCount = 0;
  let venuesWithTemplates = 0;
  let loadError: string | null = null;

  try {
    const results = await Promise.all([
      prisma.venue.count(),
      prisma.musicianUser.count(),
      prisma.venueOwner.count(),
      prisma.venueManager.count(),
      prisma.booking.count(),
      prisma.booking.count({
        where: {
          cancelledAt: null,
          slot: {
            instance: { isCancelled: false, date: { gte: today } },
          },
        },
      }),
      prisma.eventTemplate.count(),
      prisma.eventInstance.count({
        where: { isCancelled: false, date: { gte: today } },
      }),
      prisma.slot.count({
        where: {
          instance: { isCancelled: false, date: { gte: today } },
        },
      }),
      prisma.venue.count({ where: { eventTemplates: { some: {} } } }),
    ]);
    [
      venueCount,
      artistCount,
      ownerCount,
      managerCount,
      bookingTotal,
      upcomingBookings,
      templateCount,
      futureInstanceCount,
      slotFutureCount,
      venuesWithTemplates,
    ] = results;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Query failed.";
  }

  const lookup = params.lookup?.trim().toLowerCase();
  let ownerHit: { id: string; email: string } | null = null;
  let managerHit: { id: string; email: string } | null = null;
  let musicianHit: { id: string; email: string; stageName: string } | null = null;
  if (lookup && !loadError) {
    const [o, m, mu] = await Promise.all([
      prisma.venueOwner.findUnique({ where: { email: lookup }, select: { id: true, email: true } }),
      prisma.venueManager.findUnique({ where: { email: lookup }, select: { id: true, email: true } }),
      prisma.musicianUser.findUnique({
        where: { email: lookup },
        select: { id: true, email: true, stageName: true },
      }),
    ]);
    ownerHit = o;
    managerHit = m;
    musicianHit = mu;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-3 py-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Operations overview</h1>
        {opEmail ? (
          <p className="text-xs text-zinc-500">Signed in as {opEmail}</p>
        ) : null}
      </div>

      {params.resetSent ? (
        <p className="rounded border border-emerald-600/40 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-100">
          Password reset email queued (check Resend / spam).
        </p>
      ) : null}
      {params.resetError ? (
        <p className="rounded border border-red-600/40 bg-red-950/50 px-3 py-2 text-sm text-red-100">
          Reset email failed: {decodeURIComponent(params.resetError)}
        </p>
      ) : null}
      {params.linkError ? (
        <p className="rounded border border-red-600/40 bg-red-950/50 px-3 py-2 text-sm text-red-100">
          Link: {decodeURIComponent(params.linkError)}
        </p>
      ) : null}
      {params.resetLink ? (
        <div className="rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm">
          <p className="text-zinc-400">One-time reset link (internal; do not share publicly):</p>
          <textarea
            readOnly
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-200"
            rows={3}
            defaultValue={decodeURIComponent(params.resetLink)}
          />
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded border border-amber-600/40 bg-amber-950/50 px-3 py-2 text-sm text-amber-100">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Venues", venueCount],
          ["Artists", artistCount],
          ["Venue owners", ownerCount],
          ["Venue managers", managerCount],
          ["Bookings (all)", bookingTotal],
          ["Upcoming bookings", upcomingBookings],
          ["Event templates", templateCount],
          ["Future instances (from today UTC)", futureInstanceCount],
          ["Slots on future instances", slotFutureCount],
          ["Venues with ≥1 template", venuesWithTemplates],
        ].map(([label, n]) => (
          <div
            key={String(label)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          >
            <div className="text-zinc-400">{label}</div>
            <div className="font-mono text-xl text-white tabular-nums">{n as number}</div>
          </div>
        ))}
      </section>

      <section className="rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-white">Account lookup by email</h2>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Email</span>
            <input
              name="lookup"
              type="email"
              defaultValue={lookup ?? ""}
              placeholder="user@example.com"
              className="rounded border border-zinc-600 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            Search
          </button>
        </form>
        {lookup ? (
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              Venue owner:{" "}
              {ownerHit ? (
                <Link className="text-sky-400 underline" href={`/internal/admin/accounts#owner-${ownerHit.id}`}>
                  {ownerHit.email}
                </Link>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </li>
            <li>
              Venue manager:{" "}
              {managerHit ? (
                <Link className="text-sky-400 underline" href={`/internal/admin/accounts#manager-${managerHit.id}`}>
                  {managerHit.email}
                </Link>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </li>
            <li>
              Artist:{" "}
              {musicianHit ? (
                <Link className="text-sky-400 underline" href={`/internal/admin/artists/${musicianHit.id}`}>
                  {musicianHit.email} ({musicianHit.stageName})
                </Link>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </li>
          </ul>
        ) : null}
      </section>

      <section className="rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-white">Password reset tools</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Sends real email via Resend, or generates an internal link (new token; ~30m TTL). Public reset still does not
          reveal whether an account exists — here you get explicit errors for operations.
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <form action={adminSendResetEmail} className="grid gap-2 text-sm">
            <input type="hidden" name="returnPath" value="/internal/admin" />
            <label className="grid gap-1">
              <span className="text-zinc-400">Email</span>
              <input name="email" type="email" required className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Account type</span>
              <select name="accountType" className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white">
                <option value="MUSICIAN">Artist (musician)</option>
                <option value="VENUE">Venue (owner or manager email)</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
            >
              Send reset email
            </button>
          </form>
          <form action={adminGenerateResetLink} className="grid gap-2 text-sm">
            <input type="hidden" name="returnPath" value="/internal/admin" />
            <label className="grid gap-1">
              <span className="text-zinc-400">Email</span>
              <input name="email" type="email" required className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Account type</span>
              <select name="accountType" className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-white">
                <option value="MUSICIAN">Artist (musician)</option>
                <option value="VENUE">Venue (owner or manager email)</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-zinc-500 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
            >
              Generate link only
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
