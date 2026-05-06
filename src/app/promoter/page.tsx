import type { Metadata } from "next";
import Link from "next/link";
import { PromoterVenueAccessStatus } from "@/generated/prisma/client";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { publicLineupHrefForVenueDate } from "@/lib/promoterLineup";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import {
  addPromoterNightAction,
  createPromoterSeriesAction,
  requestPromoterVenueAccessAction,
} from "./actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Promoter dashboard",
  description:
    "Manage promoter series on MicStage, request venue access, and schedule nights. Open lineup links when the venue has generated that date.",
  path: "/promoter",
});

function accessLabel(status: PromoterVenueAccessStatus): { text: string; className: string } {
  switch (status) {
    case PromoterVenueAccessStatus.APPROVED:
      return { text: "Approved", className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" };
    case PromoterVenueAccessStatus.PENDING:
      return { text: "Pending", className: "border-amber-400/40 bg-amber-500/15 text-amber-50" };
    case PromoterVenueAccessStatus.REVOKED:
      return { text: "Declined", className: "border-white/20 bg-white/5 text-white/70" };
    default:
      return { text: status, className: "border-white/15 bg-white/5 text-white/70" };
  }
}

export default async function PromoterDashboardPage(props: {
  searchParams: Promise<{ notice?: string; promoter?: string }>;
}) {
  const { notice, promoter } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware for /promoter.");
  }

  const prisma = requirePrisma();
  const [seriesList, accessList] = await Promise.all([
    prisma.promoterSeries.findMany({
      where: { promoterId: session.promoterId },
      orderBy: { updatedAt: "desc" },
      include: {
        nights: {
          orderBy: { date: "asc" },
          include: { venue: { select: { id: true, name: true, slug: true } } },
        },
      },
    }),
    prisma.promoterVenueAccess.findMany({
      where: { promoterId: session.promoterId },
      include: { venue: { select: { id: true, name: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const nightLineupHrefs: Record<string, string | null> = {};
  const lineupTasks = seriesList.flatMap((s) =>
    s.nights.map((n) => ({ nightId: n.id, venueId: n.venueId, date: n.date })),
  );
  const lineupResults = await Promise.all(
    lineupTasks.map((t) =>
      publicLineupHrefForVenueDate(prisma, t.venueId, t.date).then((href) => [t.nightId, href] as const),
    ),
  );
  for (const [id, href] of lineupResults) {
    nightLineupHrefs[id] = href;
  }

  const promoterNotice = (() => {
    switch (promoter) {
      case "series_ok":
        return "Series created.";
      case "series_taken":
        return "That URL slug is already used on one of your series. Pick another slug.";
      case "series_slug":
      case "series_invalid":
        return "Check the series name and slug (lowercase letters, numbers, and hyphens only).";
      case "series_error":
        return "Could not save the series. Try again.";
      case "venue_request":
        return "Access request sent. The venue will approve or decline from their dashboard.";
      case "venue_missing":
        return "No venue matched that public URL slug. Find the venue page and copy the slug from the address bar.";
      case "venue_already":
        return "You already have approved access to that venue.";
      case "venue_pending":
        return "A request is already pending for that venue.";
      case "venue_invalid":
      case "venue_error":
        return "Could not send that request. Try again.";
      case "night_ok":
        return "Night added to your series.";
      case "night_duplicate":
        return "That venue and date are already on this series.";
      case "night_bad_date":
        return "Use a valid date (YYYY-MM-DD).";
      case "night_no_access":
        return "Approve venue access first, then add nights for that room.";
      case "night_invalid":
      case "night_error":
        return "Could not add that night. Check fields and try again.";
      case "forbidden":
        return "That series is not on your account.";
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-xs font-medium uppercase tracking-widest text-white/55">Promoter</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Create a <span className="text-white/90">series</span>, request access to venues by their public URL slug, then add
          scheduled nights. When the venue has generated that date on MicStage, an{" "}
          <span className="text-white/90">Open lineup</span> link appears here.
        </p>
        <p className="mt-2 text-xs text-white/45">
          Signed in as <span className="font-mono text-white/70">{session.email}</span>
        </p>

        {notice === "messages" ? (
          <div className="mt-6 rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-3 text-sm text-white">
            Messaging is for artists and venues. Promoters use this dashboard and venue lineup tools once access is approved.
          </div>
        ) : null}
        {promoterNotice ? (
          <div className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/90">
            {promoterNotice}
          </div>
        ) : null}

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">New series</h2>
          <p className="mt-1 text-xs text-white/55">
            A series groups your nights (e.g. a monthly brand). Slug is used internally — lowercase, hyphens optional.
          </p>
          <form action={createPromoterSeriesAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/75">Name</span>
              <input
                name="name"
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="Northside acoustic nights"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Slug (optional)</span>
              <input
                name="slug"
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="northside-acoustic"
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/75">Description (optional)</span>
              <input
                name="description"
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="Short note for your own reference"
              />
            </label>
            <div className="sm:col-span-2">
              <FormSubmitButton
                label="Create series"
                pendingLabel="Saving…"
                className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
              />
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Venue access</h2>
          <p className="mt-1 text-xs text-white/55">
            Enter the venue slug from the public URL: <span className="font-mono text-white/70">micstage.com/venues/</span>
            <strong className="font-mono text-white/85">your-venue-slug</strong>
          </p>
          <form action={requestPromoterVenueAccessAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid min-w-0 flex-1 gap-1 text-sm">
              <span className="text-white/75">Venue slug</span>
              <input
                name="venueSlug"
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-sm text-white placeholder:text-white/40"
                placeholder="red-door-comedy"
              />
            </label>
            <FormSubmitButton
              label="Request access"
              pendingLabel="Sending…"
              className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            />
          </form>

          {accessList.length === 0 ? (
            <p className="mt-4 text-sm text-white/55">No requests yet.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {accessList.map((a) => {
                const label = accessLabel(a.status);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm"
                  >
                    <Link className="font-medium text-violet-100 underline hover:text-white" href={`/venues/${a.venue.slug}`}>
                      {a.venue.name}
                    </Link>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${label.className}`}>{label.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {seriesList.length === 0 ? (
          <p className="mt-8 text-sm text-white/55">Create a series above, then add nights.</p>
        ) : (
          <div className="mt-10 grid gap-8">
            {seriesList.map((series) => {
              const venuesForNights = accessList.filter((a) => a.status === PromoterVenueAccessStatus.APPROVED);
              return (
                <section key={series.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-xl font-semibold text-white">{series.name}</h2>
                    <span className="font-mono text-xs text-white/45">{series.slug}</span>
                  </div>
                  {series.description ? <p className="mt-2 text-sm text-white/60">{series.description}</p> : null}

                  <form action={addPromoterNightAction} className="mt-6 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
                    <input type="hidden" name="seriesId" value={series.id} />
                    <label className="grid gap-1 text-sm sm:col-span-2">
                      <span className="text-white/75">Venue</span>
                      <select
                        name="venueId"
                        required
                        className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm text-white"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {venuesForNights.length ? "Choose an approved venue" : "Approve venue access first"}
                        </option>
                        {venuesForNights.map((a) => (
                          <option key={a.venue.id} value={a.venue.id}>
                            {a.venue.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/75">Date</span>
                      <input
                        name="date"
                        type="date"
                        required
                        className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/75">Title (optional)</span>
                      <input
                        name="title"
                        className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                        placeholder="Featured host, theme, etc."
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <FormSubmitButton
                        label="Add night"
                        pendingLabel="Adding…"
                        className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
                      />
                    </div>
                  </form>

                  {series.nights.length === 0 ? (
                    <p className="mt-4 text-sm text-white/55">No nights yet.</p>
                  ) : (
                    <ul className="mt-4 grid gap-2 text-sm">
                      {series.nights.map((n) => {
                        const ymd = storageYmdUtc(n.date);
                        const href = nightLineupHrefs[n.id];
                        return (
                          <li
                            key={n.id}
                            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="text-white/90">
                                {n.venue.name} · {lineupNavLabelFromYmd(ymd)}
                              </div>
                              {n.title ? <div className="text-xs text-white/55">{n.title}</div> : null}
                            </div>
                            {href ? (
                              <Link
                                className="shrink-0 text-sm font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110"
                                href={href}
                              >
                                Open lineup
                              </Link>
                            ) : (
                              <span className="shrink-0 text-xs text-white/45">
                                Lineup appears when the venue generates {ymd}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
