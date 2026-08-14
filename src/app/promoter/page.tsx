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
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { FindOpenMicPanel } from "@/components/promoter/FindOpenMicPanel";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import {
  promoterSetupChecklist,
  suggestOpenMicsForPromoterApplication,
} from "@/lib/onboarding/setupProgress";
import {
  addPromoterNightAction,
  createPromoterSeriesAction,
} from "./actions";

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
  const [seriesList, accessList, user] = await Promise.all([
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
    prisma.promoterUser.findUnique({
      where: { id: session.promoterId },
      select: {
        application: {
          select: { contactName: true, brandName: true, notes: true, cityRegion: true },
        },
      },
    }),
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
        return "Series saved.";
      case "series_taken":
      case "series_slug":
      case "series_invalid":
        return "Check the series name and try again.";
      case "series_error":
        return "Could not save the series. Try again.";
      case "venue_request":
        return "Request sent. We'll notify the venue if approval is needed.";
      case "venue_missing":
        return "We couldn't find that open mic yet. Try another name search.";
      case "venue_already":
        return "You're already connected to that venue.";
      case "venue_pending":
        return "A request is already waiting for that venue.";
      case "venue_invalid":
      case "venue_error":
        return "Could not send that request. Try again.";
      case "night_ok":
        return "Night added.";
      case "night_duplicate":
        return "That venue and date are already on this series.";
      case "night_bad_date":
        return "Pick a valid date.";
      case "night_no_access":
        return "Connect with the venue first, then add nights.";
      case "night_invalid":
      case "night_error":
        return "Could not add that night. Try again.";
      case "forbidden":
        return "That series is not on your account.";
      default:
        return null;
    }
  })();

  const approvedVenues = accessList.filter((a) => a.status === PromoterVenueAccessStatus.APPROVED);

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-xs font-medium uppercase tracking-widest text-white/55">Promoter</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Hi, {firstName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Here&apos;s what you run, what&apos;s next, and who&apos;s connected — in plain language.
        </p>

        {notice === "messages" ? (
          <div className="mt-6 rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-3 text-sm text-white">
            Messaging is for artists and venues. Use this home page to manage your open mic nights.
          </div>
        ) : null}
        {promoterNotice ? (
          <div className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/90">
            {promoterNotice}
          </div>
        ) : null}

        <div className="mt-8">
          <SetupChecklist
            heading="Make your open mic easier to run"
            subheading="Optional — skip anything and come back later. Your account already works."
            items={checklist}
            laterHref="/promoter/welcome/skip"
          />
        </div>

        <section
          id="find"
          className={`mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 ${
            focus === "find" ? "ring-2 ring-violet-400/40" : ""
          }`}
        >
          <h2 className="text-lg font-semibold text-white">Your open mic</h2>
          <p className="mt-1 text-sm text-white/60">
            {accessList.length === 0
              ? "Connect the place you host. We'll ask the venue to approve if needed."
              : "Venues you're connected with (or waiting on)."}
          </p>

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

        <section
          id="series"
          className={`mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 ${
            focus === "series" ? "ring-2 ring-violet-400/40" : ""
          }`}
        >
          <h2 className="text-lg font-semibold text-white">Name your series</h2>
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
              label="Save series"
              pendingLabel="Saving…"
              className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
            />
          </form>
        </section>

        {seriesList.length === 0 ? (
          <p className="mt-8 text-sm text-white/55">When you&apos;re ready, add a series name above, then schedule a night.</p>
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
                              Open night page
                            </Link>
                          ) : (
                            <span className="shrink-0 text-xs text-white/45">Night page appears when the venue opens that date</span>
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
      </main>
    </div>
  );
}
