import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PromoterVenueAccessStatus } from "@/generated/prisma/client";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { publicLineupHrefForVenueDate } from "@/lib/promoterLineup";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { absoluteUrl } from "@/lib/publicSeo";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { FindOpenMicPanel } from "@/components/promoter/FindOpenMicPanel";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import {
  promoterSetupChecklist,
  suggestOpenMicsForPromoterApplication,
} from "@/lib/onboarding/setupProgress";
import {
  addPromoterNightAction,
  createPromoterSeriesAction,
} from "./actions";
import { listRemovableOpenMicsForPromoter } from "@/lib/publicListings/openMicSelfRemoval";

export const metadata: Metadata = buildPublicMetadata({
  title: "Promoter home",
  description: "Run your open mic on MicStage — connect your venue, confirm nights, and share your page.",
  path: "/promoter",
});

function accessLabel(status: PromoterVenueAccessStatus): { text: string; className: string } {
  switch (status) {
    case PromoterVenueAccessStatus.APPROVED:
      return { text: "Connected", className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" };
    case PromoterVenueAccessStatus.PENDING:
      return { text: "Waiting on venue", className: "border-amber-400/40 bg-amber-500/15 text-amber-50" };
    case PromoterVenueAccessStatus.REVOKED:
      return { text: "Not approved", className: "border-white/20 bg-white/5 text-white/70" };
    default:
      return { text: "Update", className: "border-white/15 bg-white/5 text-white/70" };
  }
}

export default async function PromoterDashboardPage(props: {
  searchParams: Promise<{ notice?: string; promoter?: string; focus?: string }>;
}) {
  const { notice, promoter, focus } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware for /promoter.");
  }

  const prisma = requirePrisma();
  const [seriesList, accessList, user, removableOpenMics] = await Promise.all([
    prisma.promoterSeries.findMany({
      where: { promoterId: session.promoterId, archivedAt: null },
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
    prisma.promoterUser.findUnique({
      where: { id: session.promoterId },
      select: {
        application: {
          select: { contactName: true, brandName: true, notes: true, cityRegion: true },
        },
      },
    }),
    listRemovableOpenMicsForPromoter(prisma, session.promoterId),
  ]);

  const cookieStore = await cookies();
  const welcomeSeen = cookieStore.get("om_promoter_welcome_seen")?.value === "1";
  if (!welcomeSeen && seriesList.length === 0 && accessList.length === 0) {
    redirect("/promoter/welcome");
  }

  const firstName =
    user?.application?.contactName?.trim().split(/\s+/)[0] ||
    session.email.split("@")[0] ||
    "there";

  const suggested = user?.application
    ? await suggestOpenMicsForPromoterApplication(prisma, user.application)
    : [];

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

  const checklist = promoterSetupChecklist({
    hasOpenMicConnected: accessList.some((a) => a.status === PromoterVenueAccessStatus.APPROVED),
    hasSeries: seriesList.length > 0,
    hasNight: seriesList.some((s) => s.nights.length > 0),
  });

  const promoterNotice = (() => {
    switch (promoter) {
      case "series_ok":
        return focus === "schedule"
          ? "Your open mic is saved. Add the schedule when you're ready so performers can find the next one."
          : "Open mic saved. Next: connect the venue when you're ready.";
      case "series_taken":
      case "series_slug":
      case "series_invalid":
        return "Check the open mic name and try again.";
      case "series_error":
        return "Could not save. Try again.";
      case "connected":
      case "venue_request":
        return "Your open mic is connected. We'll notify the venue if they still need to approve.";
      case "venue_missing":
        return "We couldn't find that open mic yet. Try another name search.";
      case "venue_already":
        return "Your open mic is already connected.";
      case "venue_pending":
        return "Waiting on the venue — they still need to approve.";
      case "venue_invalid":
      case "venue_error":
        return "Could not send that request. Try again.";
      case "night_ok":
        return "Schedule confirmed.";
      case "night_duplicate":
        return "That venue and date are already on your list.";
      case "night_bad_date":
        return "Pick a valid date.";
      case "night_no_access":
        return "Connect your open mic first, then add nights.";
      case "night_invalid":
      case "night_error":
        return "Could not add that night. Try again.";
      case "forbidden":
        return "That open mic is not on your account.";
      case "remove_missing":
        return "That open mic is no longer on MicStage.";
      case "remove_invalid":
      case "remove_error":
        return "Could not remove that open mic. Try again.";
      default:
        return null;
    }
  })();

  const approvedVenues = accessList.filter((a) => a.status === PromoterVenueAccessStatus.APPROVED);
  const primaryVenue = approvedVenues[0]?.venue ?? accessList[0]?.venue ?? null;
  // Upcoming nights are relative to "now" for the promoter dashboard (intentional).
  // eslint-disable-next-line react-hooks/purity -- schedule horizon is relative to request time
  const nowMs = Date.now();
  const upcomingNight = seriesList
    .flatMap((s) => s.nights.map((n) => ({ ...n, seriesName: s.name })))
    .filter((n) => n.date.getTime() >= nowMs - 12 * 3600 * 1000)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  const primaryPublicUrl = primaryVenue ? absoluteUrl(`/venues/${primaryVenue.slug}`) : null;
  const isLinked = approvedVenues.length > 0;
  const justConnected =
    promoter === "connected" || promoter === "venue_already" || promoter === "venue_request";
  const isUnlinkedEmpty = accessList.length === 0;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-xs font-medium uppercase tracking-widest text-white/55">Promoter</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Hi, {firstName}</h1>

        {notice === "messages" ? (
          <div className="mt-6 rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-3 text-sm text-white">
            Messaging is for artists and venues. Use this home page to manage your open mic.
          </div>
        ) : null}
        {promoterNotice ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-white/90">
            {promoterNotice}
          </div>
        ) : null}

        {removableOpenMics.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Your open mics on MicStage</h2>
            <p className="mt-1 text-sm text-white/60">Manage listings linked to your promoter account.</p>
            <ul className="mt-4 grid gap-3">
              {removableOpenMics.map((m) => (
                <li
                  key={m.listingId}
                  className="rounded-xl border border-white/10 bg-black/25 p-4"
                >
                  <p className="text-base font-semibold text-white">{m.listingName}</p>
                  {m.placeLine ? <p className="mt-1 text-sm text-white/55">{m.placeLine}</p> : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={`/open-mics/${m.listingSlug}`}
                      className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      View listing
                    </Link>
                    <Link
                      href={`/promoter/open-mics/${m.listingSlug}/remove`}
                      className="inline-flex h-11 items-center justify-center rounded-md border border-red-400/35 bg-red-500/10 px-4 text-sm font-semibold text-red-50 hover:bg-red-500/20"
                    >
                      Remove this open mic
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(isLinked || justConnected) && primaryVenue ? (
          <section className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-100/70">Your open mic</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{primaryVenue.name}</h2>
            {justConnected ? (
              <p className="mt-2 text-base font-medium text-emerald-50">Your open mic is connected.</p>
            ) : null}
            <p className="mt-2 text-sm text-white/75">
              {upcomingNight
                ? `Next night: ${lineupNavLabelFromYmd(storageYmdUtc(upcomingNight.date))}`
                : "No upcoming night scheduled yet."}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {isLinked
                ? "Performer signups: managed on your open mic page (optional)."
                : "Waiting on the venue to approve — you can still prep schedule and sharing."}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={`/venues/${primaryVenue.slug}`}
                className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
              >
                Manage my open mic
              </Link>
            </div>
            {justConnected ? (
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <Link
                  href="/promoter#night"
                  className="rounded-xl border border-white/15 bg-black/25 px-3 py-3 text-center text-sm font-semibold hover:bg-white/10"
                >
                  Confirm schedule
                </Link>
                <Link
                  href={`/venues/${primaryVenue.slug}`}
                  className="rounded-xl border border-white/15 bg-black/25 px-3 py-3 text-center text-sm font-semibold hover:bg-white/10"
                >
                  Turn on performer signups
                </Link>
                <Link
                  href={`#share`}
                  className="rounded-xl border border-white/15 bg-black/25 px-3 py-3 text-center text-sm font-semibold hover:bg-white/10"
                >
                  Share my page
                </Link>
              </div>
            ) : null}
            {primaryPublicUrl ? (
              <div id="share" className="mt-6">
                <p className="mb-2 text-sm font-medium text-white/85">Share your page</p>
                <SharePageButtons url={primaryPublicUrl} label="Public page" />
              </div>
            ) : null}
          </section>
        ) : null}

        {isUnlinkedEmpty ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">You haven&apos;t connected an open mic yet.</h2>
            <p className="mt-2 text-sm text-white/65">Pick one path — it only takes a minute.</p>
            <div className="mt-5 grid gap-3">
              <Link
                href="/promoter/welcome?step=find"
                className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
              >
                Find my open mic
              </Link>
              <Link
                href="/promoter/welcome?step=create"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
              >
                Create a new open mic
              </Link>
              <p className="text-center text-sm text-white/50">You can explore the rest of MicStage anytime.</p>
            </div>
            <div className="mt-6">
              <FindOpenMicPanel suggested={suggested} />
            </div>
          </section>
        ) : null}

        {!isUnlinkedEmpty ? (
          <div className="mt-8">
            <SetupChecklist
              heading="Make your open mic easier to run"
              subheading="Optional — skip anything and come back later."
              items={checklist}
              laterHref="/promoter/welcome/skip"
            />
          </div>
        ) : null}

        {!isUnlinkedEmpty ? (
        <section
          id="find"
          className={`mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 ${
            focus === "find" ? "ring-2 ring-violet-400/40" : ""
          }`}
        >
          <h2 className="text-lg font-semibold text-white">Connected places</h2>
          <p className="mt-1 text-sm text-white/60">Venues you host with (or are waiting on).</p>

          {accessList.length > 0 ? (
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
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${label.className}`}>
                      {label.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="mt-5">
            <FindOpenMicPanel suggested={suggested} />
          </div>
        </section>
        ) : null}

        {!isUnlinkedEmpty ? (
          <>
        <section
          id="series"
          className={`mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 ${
            focus === "series" ? "ring-2 ring-violet-400/40" : ""
          }`}
        >
          <h2 className="text-lg font-semibold text-white">Name your open mic</h2>
          <p className="mt-1 text-xs text-white/55">Optional. Example: “Friday Night Open Mic.”</p>
          <form action={createPromoterSeriesAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Name</span>
              <input
                name="name"
                required
                defaultValue={user?.application?.brandName || ""}
                className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
                placeholder="Friday night open mic"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Note (optional)</span>
              <input
                name="description"
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="For your own reference"
              />
            </label>
            <FormSubmitButton
              label="Save name"
              pendingLabel="Saving…"
              className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
            />
          </form>
        </section>

        {seriesList.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-white/65">
            <p className="font-medium text-white/85">You haven&apos;t named your open mic series yet.</p>
            <p className="mt-1">Optional — add a simple name above when you&apos;re ready.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-8">
            {seriesList.map((series) => (
              <section
                key={series.id}
                id="night"
                className={`rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 ${
                  focus === "night" ? "ring-2 ring-violet-400/40" : ""
                }`}
              >
                <h2 className="text-xl font-semibold text-white">{series.name}</h2>
                {series.description ? <p className="mt-2 text-sm text-white/60">{series.description}</p> : null}

                <form
                  action={addPromoterNightAction}
                  className="mt-6 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2"
                >
                  <input type="hidden" name="seriesId" value={series.id} />
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="text-white/75">Venue</span>
                    <select
                      name="venueId"
                      required
                      className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        {approvedVenues.length ? "Choose a connected venue" : "Connect a venue first"}
                      </option>
                      {approvedVenues.map((a) => (
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
                      className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-white/75">Title (optional)</span>
                    <input
                      name="title"
                      className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                      placeholder="Theme, guest host, etc."
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <FormSubmitButton
                      label="Confirm schedule"
                      pendingLabel="Saving…"
                      className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
                    />
                  </div>
                </form>

                {series.nights.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-4 text-sm text-white/65">
                    <p className="font-medium text-white/85">No upcoming nights yet.</p>
                    <p className="mt-1">Confirm a date above so performers know when to come.</p>
                  </div>
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
                              Open night page
                            </Link>
                          ) : (
                            <span className="shrink-0 text-xs text-white/45">
                              Night page appears when the venue opens that date
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
          </>
        ) : null}
      </main>
    </div>
  );
}
