import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { publicLineupHrefForNight } from "@/lib/promoterLineup";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { buildPublicMetadata, absoluteUrl } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { HostAddNightForm } from "@/components/host/HostAddNightForm";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import {
  addPromoterNightAction,
  addPromoterRecurringNightsAction,
  changePromoterNightVenueAction,
  createPromoterSeriesAction,
} from "./actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Host dashboard",
  description: "Run every open mic you host — multiple venues, recurring nights, signups, and lineups.",
  path: "/promoter",
});

export default async function HostDashboardPage(props: {
  searchParams: Promise<{ notice?: string; promoter?: string; focus?: string }>;
}) {
  const { notice, promoter } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware for /promoter.");
  }

  const prisma = requirePrisma();
  const [seriesList, user] = await Promise.all([
    prisma.promoterSeries.findMany({
      where: { promoterId: session.promoterId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        nights: {
          orderBy: { date: "asc" },
          include: { venue: { select: { id: true, name: true, slug: true, city: true, region: true } } },
        },
      },
    }),
    prisma.promoterUser.findUnique({
      where: { id: session.promoterId },
      select: { displayName: true, hostSlug: true, application: { select: { contactName: true, brandName: true } } },
    }),
  ]);

  const cookieStore = await cookies();
  const welcomeSeen = cookieStore.get("om_promoter_welcome_seen")?.value === "1";
  if (!welcomeSeen && seriesList.length === 0) {
    redirect("/promoter/welcome");
  }

  const firstName =
    user?.displayName?.trim().split(/\s+/)[0] ||
    user?.application?.contactName?.trim().split(/\s+/)[0] ||
    session.email.split("@")[0] ||
    "there";

  const nowMs = Date.now();
  const allNights = seriesList.flatMap((s) =>
    s.nights.map((n) => ({ ...n, seriesId: s.id, seriesName: s.name })),
  );
  const upcomingNights = allNights
    .filter((n) => n.date.getTime() >= nowMs - 12 * 3600 * 1000)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextNight = upcomingNights[0] ?? null;

  const venueMap = new Map<string, { venueId: string; name: string; place: string | null }>();
  for (const n of allNights) {
    venueMap.set(n.venue.id, {
      venueId: n.venue.id,
      name: n.venue.name,
      place: [n.venue.city, n.venue.region].filter(Boolean).join(", ") || null,
    });
  }
  const recentVenues = [...venueMap.values()];

  const nightLineupHrefs: Record<string, string | null> = {};
  await Promise.all(
    upcomingNights.map(async (n) => {
      nightLineupHrefs[n.id] = await publicLineupHrefForNight(prisma, n.id);
    }),
  );

  const hostPublicUrl = user?.hostSlug ? absoluteUrl(`/hosts/${user.hostSlug}`) : null;

  const promoterNotice = (() => {
    switch (promoter) {
      case "series_ok":
        return "Open mic saved. Add your first night below.";
      case "night_ok":
        return "Night saved.";
      case "venue_changed":
        return "Venue updated.";
      case "night_duplicate":
        return "That venue and date are already on your list.";
      case "night_bad_date":
        return "Pick a valid date.";
      case "venue_missing":
        return "We couldn't find that venue.";
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-xs font-medium uppercase tracking-widest text-white/55">Host dashboard</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Hi, {firstName}</h1>

        {notice === "messages" ? (
          <div className="mt-6 rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-3 text-sm text-white">
            Messaging is for artists and venues. Use this dashboard to manage your open mics.
          </div>
        ) : null}
        {promoterNotice ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-white/90">
            {promoterNotice}
          </div>
        ) : null}

        {nextNight ? (
          <section className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-100/70">Your next night</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{nextNight.seriesName}</h2>
            <p className="mt-2 text-sm text-white/80">
              {lineupNavLabelFromYmd(storageYmdUtc(nextNight.date))} · {nextNight.venue.name}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {nightLineupHrefs[nextNight.id] ? (
                <>
                  <Link
                    href={`/promoter/nights/${nextNight.id}`}
                    className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black"
                  >
                    Manage lineup
                  </Link>
                  <Link
                    href={nightLineupHrefs[nextNight.id]!}
                    className="inline-flex h-11 items-center justify-center rounded-md border border-white/25 px-4 text-sm font-semibold text-white"
                  >
                    Share signup
                  </Link>
                </>
              ) : null}
              {hostPublicUrl ? (
                <SharePageButtons url={hostPublicUrl} label="Share host page" />
              ) : null}
            </div>
          </section>
        ) : null}

        {hostPublicUrl && user?.hostSlug ? (
          <p className="mt-4 text-sm text-white/60">
            Your host page:{" "}
            <Link href={`/hosts/${user.hostSlug}`} className="underline text-[rgb(var(--om-neon))]">
              /hosts/{user.hostSlug}
            </Link>
          </p>
        ) : null}

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Your open mics</h2>
            <Link
              href="#add-series"
              className="inline-flex h-10 items-center rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50"
            >
              + Add another open mic
            </Link>
          </div>

          {seriesList.length === 0 ? (
            <div id="add-series" className="mt-4 rounded-2xl border border-dashed border-white/15 p-5">
              <p className="text-sm text-white/70">Name your first open mic series, then add nights at any venue.</p>
              <form action={createPromoterSeriesAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-white/75">Open mic name</span>
                  <input
                    name="name"
                    required
                    defaultValue={user?.application?.brandName || ""}
                    placeholder="Chris's Open Mic"
                    className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                  />
                </label>
                <div className="sm:col-span-2">
                  <FormSubmitButton label="Create open mic" pendingLabel="Saving…" className="h-11 rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50" />
                </div>
              </form>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {seriesList.map((s) => {
                const next = s.nights.find((n) => n.date.getTime() >= nowMs);
                return (
                  <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold text-white">{s.name}</p>
                    <p className="mt-1 text-xs text-white/55">
                      {next
                        ? `Next: ${lineupNavLabelFromYmd(storageYmdUtc(next.date))} at ${next.venue.name}`
                        : "No upcoming night"}
                    </p>
                    <p className="mt-1 text-xs text-white/45">{s.nights.length} night(s) scheduled</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {upcomingNights.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-white">Upcoming nights</h2>
            <ul className="mt-4 grid gap-2 text-sm">
              {upcomingNights.slice(0, 20).map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  <span>
                    <span className="font-medium text-white">{lineupNavLabelFromYmd(storageYmdUtc(n.date))}</span>
                    {" · "}
                    <span className="text-white/80">{n.seriesName}</span>
                    {" — "}
                    <span className="text-white/70">{n.venue.name}</span>
                  </span>
                  {nightLineupHrefs[n.id] ? (
                    <Link href={nightLineupHrefs[n.id]!} className="text-xs font-semibold text-[rgb(var(--om-neon))] underline">
                      Lineup
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-10 grid gap-8">
          {seriesList.map((s) => (
            <HostAddNightForm
              key={s.id}
              seriesId={s.id}
              seriesName={s.name}
              recentVenues={recentVenues}
              addNightAction={addPromoterNightAction}
              addRecurringAction={addPromoterRecurringNightsAction}
              changeVenueAction={changePromoterNightVenueAction}
              nights={s.nights
                .filter((n) => n.date.getTime() >= nowMs - 86400000)
                .map((n) => ({
                  id: n.id,
                  dateLabel: lineupNavLabelFromYmd(storageYmdUtc(n.date)),
                  venueId: n.venue.id,
                  venueName: n.venue.name,
                  title: n.title,
                  lineupHref: nightLineupHrefs[n.id] ?? null,
                }))}
            />
          ))}
        </div>

        {seriesList.length > 0 ? (
          <section id="add-series" className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-base font-semibold text-white">Add another open mic</h2>
            <form action={createPromoterSeriesAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1 text-sm">
                <span className="text-white/75">Name</span>
                <input name="name" required className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white" placeholder="Tuesday Comedy" />
              </label>
              <FormSubmitButton label="Add series" pendingLabel="…" className="h-11 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold" />
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
