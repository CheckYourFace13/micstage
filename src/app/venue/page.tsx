import Link from "next/link";
import type { Venue } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";
import { requirePrisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { VENUE_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { generateDateSchedule, inviteManager } from "./actions";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { absoluteUrl } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd, minutesToTimeLabel, toIsoDateOnly, weekdayToLabel } from "@/lib/time";
import {
  isValidLineupYmd,
  pickPrimaryLineup,
  storageYmdUtc,
  upcomingLineupDateYmds,
} from "@/lib/venuePublicLineup";
import type { LineupTemplate } from "@/lib/venuePublicLineupData";
import { loadLineupTemplatesByVenueIds, venueIsOperational } from "@/lib/venueDashboardOperational";
import { VenueDashboardShareBar } from "@/components/venue/VenueDashboardShareBar";
import { VenueSlotManagementRow } from "@/components/venue/VenueSlotManagementRow";
import { VenueAddRecurringNightFormFields } from "./VenueAddRecurringNightForm";
import { VenueProfileForm } from "./VenueProfileForm";
import { WeeklyScheduleForm } from "./WeeklyScheduleForm";

type VenueScheduleTemplateInclude = {
  instances: {
    where: { date: { gte: Date } };
    orderBy: { date: "asc" };
    take: number;
    include: { slots: { orderBy: { startMin: "asc" }; include: { booking: true } } };
  };
};

function venueScheduleTemplateIncludeAtRequest(): VenueScheduleTemplateInclude {
  return {
    instances: {
      where: { date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 2,
      include: { slots: { orderBy: { startMin: "asc" }, include: { booking: true } } },
    },
  };
}

type PortalEventTemplate = Prisma.EventTemplateGetPayload<{ include: VenueScheduleTemplateInclude }>;
export type VenuePortalRow = Venue & { eventTemplates: PortalEventTemplate[] };

function logVenuePortalFailure(phase: string, e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`[venue portal] ${phase}`, e.code, e.meta ?? {}, e.message);
  } else if (e instanceof Prisma.PrismaClientValidationError) {
    console.error(`[venue portal] ${phase} (validation)`, e.message);
  } else {
    console.error(`[venue portal] ${phase}`, e);
  }
}

async function loadVenuePortalRows(session: Awaited<ReturnType<typeof requireVenueSession>>): Promise<{
  venues: VenuePortalRow[];
  loadError: "none" | "requirePrisma" | "venueList";
}> {
  let prisma: ReturnType<typeof requirePrisma>;
  try {
    prisma = requirePrisma();
  } catch (e) {
    logVenuePortalFailure("requirePrisma", e);
    return { venues: [], loadError: "requirePrisma" };
  }

  let venueIds: string[] = [];
  try {
    venueIds = await venueIdsForSession(session);
  } catch (e) {
    logVenuePortalFailure("venueIdsForSession", e);
    venueIds = [];
  }

  let venuesBase: Venue[] = [];
  if (venueIds.length > 0) {
    try {
      venuesBase = await prisma.venue.findMany({
        where: { id: { in: venueIds } },
        orderBy: { createdAt: "desc" },
      });
    } catch (e) {
      logVenuePortalFailure("venue.findMany (scalars)", e);
      return { venues: [], loadError: "venueList" };
    }
  }

  const templatesByVenueId: Record<string, PortalEventTemplate[]> = {};
  if (venueIds.length > 0) {
    try {
      const tpls = await prisma.eventTemplate.findMany({
        where: { venueId: { in: venueIds } },
        orderBy: [{ weekday: "asc" }, { startTimeMin: "asc" }],
        include: venueScheduleTemplateIncludeAtRequest(),
      });
      for (const t of tpls) {
        const list = templatesByVenueId[t.venueId] ?? [];
        list.push(t);
        templatesByVenueId[t.venueId] = list;
      }
    } catch (e) {
      logVenuePortalFailure("eventTemplate.findMany (instances/slots/bookings)", e);
    }
  }

  const venues: VenuePortalRow[] = venuesBase.map((v) => ({
    ...v,
    eventTemplates: templatesByVenueId[v.id] ?? [],
  }));

  return { venues, loadError: "none" };
}

export const metadata = {
  title: "Venue portal | MicStage",
};

export const dynamic = "force-dynamic";

/** Preserve flash/query params when switching `lineupDay` from the dashboard. */
function venueDashboardChipHref(
  preserved: Record<string, string | undefined>,
  ymd: string,
): string {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(preserved)) {
    if (val == null || val === "" || key === "lineupDay") continue;
    p.set(key, val);
  }
  p.set("lineupDay", ymd);
  return `/venue?${p.toString()}`;
}

export default async function VenuePortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    profile?: string;
    profileError?: string;
    scheduleError?: string;
    scheduleSuccess?: string;
    planError?: string;
    planSuccess?: string;
    houseBook?: string;
    invite?: string;
    venueError?: string;
    venueNotice?: string;
    socialsError?: string;
    inviteError?: string;
    houseBookError?: string;
    slotLine?: string;
    slotDeleteError?: string;
    slotDeleted?: string;
    lineupDay?: string;
  }>;
}) {
  const q = await searchParams;
  const preservedQuery: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(q).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const session = await requireVenueSession();
  const { venues, loadError } = await loadVenuePortalRows(session);

  if (loadError === "requirePrisma" || loadError === "venueList") {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <h1 className="om-heading text-2xl tracking-wide text-white">Venue dashboard</h1>
          <p className="mt-3 text-sm text-white/75">
            We couldn&apos;t load your dashboard right now (connection or server issue). Your account is still signed in.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
              href={VENUE_DASHBOARD_HREF}
            >
              Retry dashboard
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
              href="/"
            >
              Home
            </Link>
            <LogoutVenueArtistButton
              label="Logout"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            />
          </div>
        </main>
      </div>
    );
  }

  const operationalVenueIds = venues.filter(venueIsOperational).map((v) => v.id);
  let lineupByVenueId: Record<string, LineupTemplate[]> = {};
  try {
    if (operationalVenueIds.length > 0) {
      lineupByVenueId = await loadLineupTemplatesByVenueIds(operationalVenueIds);
    }
  } catch (e) {
    logVenuePortalFailure("loadLineupTemplatesByVenueIds", e);
  }
  const anyVenueOperational = operationalVenueIds.length > 0;

  const todayIso = toIsoDateOnly(new Date());
  const horizonDaysFor = (tier: "FREE" | "PRO") => (tier === "FREE" ? 60 : 90);
  const plusDaysIso = (days: number) => toIsoDateOnly(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-6 py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue portal</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">Venue dashboard</h1>
            <p className="mt-2 text-sm text-white/70">
              {anyVenueOperational ? (
                <>
                  <span className="text-white/85">Control center:</span> share your lineup, watch tonight&apos;s board, and
                  manage slots below. Signed in as <span className="font-mono">{session.email}</span>
                </>
              ) : (
                <>
                  <span className="text-white/85">Finish setup:</span> save your venue profile and weekly schedule — your public
                  page updates as you go. Signed in as <span className="font-mono">{session.email}</span>
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/performers"
              >
                Search artists
              </Link>
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/locations"
              >
                Search open mic venues
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link className="text-sm text-white/70 hover:text-white" href="/">
              Home
            </Link>
            <LogoutVenueArtistButton
              label="Logout"
              className="text-sm text-white/70 hover:text-white"
            />
          </div>
        </header>

        {q.profile === "saved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Profile saved.</span>{" "}
            {anyVenueOperational ? (
              <>
                Your public venue and lineup pages pick this up — refresh if you don&apos;t see changes yet.
              </>
            ) : (
              <>
                Your public venue page shows this info—refresh if needed. Next: set or update your weekly schedule so artists can
                book.
              </>
            )}
          </div>
        ) : null}
        {q.profileError === "duplicateWeekday" || q.scheduleError === "duplicateWeekday" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            You already have a recurring schedule for that weekday. Use{" "}
            <span className="font-semibold text-white">Set weekly schedule</span> to change it — MicStage keeps one template per
            weekday per venue.
          </div>
        ) : null}
        {q.profileError === "badRange" || q.scheduleError === "badRange" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            End date must be on or after start date, and your booking window must fit your plan limits.
          </div>
        ) : null}
        {q.profileError === "badWindow" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Booking window must be within your current plan’s limit (up to 60 days for free).
          </div>
        ) : null}
        {q.scheduleError === "outsideSeries" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That date is outside your venue’s open mic date range. Update the booking window in your weekly schedule or pick
            another date.
          </div>
        ) : null}
        {q.scheduleError === "noWeekdays" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Choose at least one weekday for your weekly schedule.
          </div>
        ) : null}
        {q.scheduleError === "invalidTime" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Use valid start/end times (HH:MM, 24h) with end after start.
          </div>
        ) : null}
        {q.scheduleError === "templateMissing" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That schedule template is no longer available. Refresh the page and try again.
          </div>
        ) : null}
        {q.scheduleSuccess === "weekly" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Schedule saved.</span> Future open slots are updated;
            existing bookings were left as-is. Artists can now see live times on your public page.
          </div>
        ) : null}
        {q.scheduleSuccess === "template" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Recurring night added.</span> Generate dates for this
            template, or use <span className="font-medium text-white">Set weekly schedule</span> to manage everything in one
            place.
          </div>
        ) : null}
        {q.scheduleSuccess === "date" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Slots refreshed</span> for that date—bookings already held
            were not changed.
          </div>
        ) : null}
        {q.houseBook === "1" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Walk-up / house booking saved for that slot.
          </div>
        ) : null}
        {q.invite === "sent" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Manager invited. Share the temporary password securely; they should log in and change it.
          </div>
        ) : null}
        {q.planSuccess === "1" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Plan upgraded to PRO (development only until payments are live).
          </div>
        ) : null}
        {q.profileError === "format" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Invalid performance format. Please try again.
          </div>
        ) : null}
        {q.socialsError === "needWebsite" || q.profileError === "missingWebsite" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Add a website URL on your venue profile and save, then run auto-find again.
          </div>
        ) : null}
        {q.socialsError === "fetchFailed" || q.profileError === "socialFetchFailed" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Could not fetch your website for social discovery. You can still enter social links manually.
          </div>
        ) : null}
        {q.venueNotice === "socialsDiscovered" || q.profileError === "socialFound" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Social links were discovered from your website. Review fields and save your profile to confirm.
          </div>
        ) : null}
        {q.venueError === "invalidForm" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That request was incomplete or out of date. Refresh the page and try again — if it keeps happening, use your
            browser&apos;s back button to re-open the form.
          </div>
        ) : null}
        {q.venueError === "forbidden" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            You don&apos;t have access to that action for this venue. Refresh if your login changed.
          </div>
        ) : null}
        {q.venueError === "venueMissing" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Venue data could not be loaded. Refresh and try again.
          </div>
        ) : null}
        {q.inviteError === "ownerOnly" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Only the venue owner can invite managers right now.
          </div>
        ) : null}
        {q.planError === "ownerOnly" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Only the venue owner can change the subscription plan.
          </div>
        ) : null}
        {q.houseBookError === "missing" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That slot no longer exists. Refresh the dashboard.
          </div>
        ) : null}
        {q.houseBookError === "taken" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Someone else booked that slot first. Refresh to see the latest schedule.
          </div>
        ) : null}
        {q.houseBookError === "past" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That slot has already started — pick a future time.
          </div>
        ) : null}
        {q.houseBookError === "cancelled" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That date was cancelled — house booking isn&apos;t available.
          </div>
        ) : null}
        {q.houseBookError === "blocked" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            House booking isn&apos;t allowed for that slot under your current schedule rules or date range.
          </div>
        ) : null}
        {q.planError === "paymentsDisabled" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Plan upgrades are currently disabled in production until payments are connected.
          </div>
        ) : null}
        {q.slotLine === "saved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Lineup row saved.</span> Times, display name, and booking type
            are updated for that slot.
          </div>
        ) : null}
        {q.slotDeleted === "1" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Slot removed from the schedule.
          </div>
        ) : null}
        {q.slotDeleteError === "musicianBooked" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That slot has an active MicStage artist booking — cancel the booking first, or keep the slot.
          </div>
        ) : null}

        {venues.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-8">
            <div className="text-sm text-white/70">
              <p>
                No venues are linked to this login yet. If you haven&apos;t created a room on MicStage, start at{" "}
                <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/register/venue">
                  venue registration
                </Link>
                .
              </p>
              <p className="mt-3 text-white/60">
                If you already completed registration but still see this, your session may be out of sync or data may
                need a fix —{" "}
                <Link className="underline hover:text-white" href="/contact">
                  contact support
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-8">
            {venues.map((v) => {
              const operational = venueIsOperational(v);
              const lineupTemplates = lineupByVenueId[v.id] ?? [];
              const nowDash = new Date();
              const primary = operational ? pickPrimaryLineup(lineupTemplates, v.timeZone, nowDash) : null;
              const upcomingYmds = operational
                ? upcomingLineupDateYmds(lineupTemplates, v.timeZone, nowDash, 21)
                : [];
              const heroYmd = primary
                ? storageYmdUtc(primary.instance.date)
                : upcomingYmds[0] ?? null;
              const managedYmds = new Set(
                v.eventTemplates.flatMap((t) => t.instances.map((i) => storageYmdUtc(i.date))),
              );
              const rawLineupDay = typeof q.lineupDay === "string" ? q.lineupDay.trim() : "";
              const selectedYmd =
                rawLineupDay &&
                isValidLineupYmd(rawLineupDay) &&
                (upcomingYmds.includes(rawLineupDay) || managedYmds.has(rawLineupDay))
                  ? rawLineupDay
                  : heroYmd;
              const lineupPath = selectedYmd ? `/venues/${v.slug}/lineup/${selectedYmd}` : null;
              const hDays = horizonDaysFor(v.subscriptionTier);
              const lineupBadge =
                operational && primary && selectedYmd && storageYmdUtc(primary.instance.date) === selectedYmd
                  ? primary.badge
                  : null;
              const templatesForSelectedDay =
                selectedYmd == null
                  ? []
                  : v.eventTemplates
                      .map((t) => ({
                        template: t,
                        instances: t.instances.filter((i) => storageYmdUtc(i.date) === selectedYmd),
                      }))
                      .filter((row) => row.instances.length > 0);

              return (
              <section key={v.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue</div>
                      {operational ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
                          Live ops
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">{v.name}</h2>
                    <div className="mt-1 text-sm text-white/70">{v.formattedAddress}</div>
                    <div className="mt-2 text-xs text-white/60">
                      Public page:{" "}
                      <Link className="underline" href={`/venues/${v.slug}`}>
                        /venues/{v.slug}
                      </Link>
                    </div>
                    {operational ? (
                      <a
                        href={`#venue-profile-${v.id}`}
                        className="mt-3 inline-flex text-sm font-medium text-[rgb(var(--om-neon))] underline hover:brightness-110"
                      >
                        Edit venue info
                      </a>
                    ) : null}
                  </div>
                </div>

                {operational ? (
                  <div className="mt-8 rounded-2xl border border-[rgba(var(--om-neon),0.55)] bg-gradient-to-b from-[rgba(var(--om-neon),0.12)] to-black/35 p-6 sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="om-heading text-2xl font-bold tracking-wide text-white">Lineup & sharing</h3>
                        <p className="mt-2 max-w-xl text-sm text-white/70">
                          Share links, pick a night, then edit the live grid — this is your open mic control center.
                        </p>
                      </div>
                      {lineupBadge ? (
                        <span className="shrink-0 rounded-full border border-[rgba(var(--om-neon),0.5)] bg-black/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[rgb(var(--om-neon))]">
                          {lineupBadge === "live" ? "Live now" : lineupBadge === "tonight" ? "Tonight" : "Upcoming"}
                        </span>
                      ) : null}
                    </div>

                    {upcomingYmds.length > 0 ? (
                      <div className="mt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/50">Upcoming nights</div>
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          role="tablist"
                          aria-label="Select which night to manage"
                        >
                          {upcomingYmds.map((ymd) => {
                            const isSelected = ymd === selectedYmd;
                            return (
                              <Link
                                key={ymd}
                                href={venueDashboardChipHref(preservedQuery, ymd)}
                                scroll={false}
                                role="tab"
                                aria-selected={isSelected}
                                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                  isSelected
                                    ? "border-[rgb(var(--om-neon))] bg-[rgb(var(--om-neon))]/22 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(var(--om-neon),0.4)]"
                                    : "border-white/15 bg-black/30 font-medium text-white/80 hover:border-white/25 hover:bg-black/40"
                                }`}
                              >
                                {lineupNavLabelFromYmd(ymd)}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {selectedYmd && lineupPath ? (
                      <>
                        <div className="mt-6 border-l-2 border-[rgb(var(--om-neon))]/60 pl-4">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--om-neon))]/90">
                            Selected night
                          </div>
                          <div className="mt-1 text-lg font-semibold tracking-tight text-white">
                            {lineupNavLabelFromYmd(selectedYmd)}
                          </div>
                        </div>

                        <div className="mt-5">
                          <VenueDashboardShareBar
                            lineupUrl={absoluteUrl(lineupPath)}
                            embedUrl={absoluteUrl(`${lineupPath}?embed=1`)}
                            publicVenueUrl={absoluteUrl(`/venues/${v.slug}`)}
                            jsonUrl={absoluteUrl(`/api/public/venues/${v.slug}/lineup?date=${selectedYmd}`)}
                          />
                        </div>
                        <p className="mt-3 text-xs text-white/45">
                          Links and API target this night only. Switch nights with the chips above.
                        </p>
                      </>
                    ) : (
                      <p className="mt-6 text-sm text-white/65">
                        No upcoming nights in the booking window yet. Save your schedule blocks and generate dates — night chips
                        and share links will show up here.
                      </p>
                    )}

                    <div className="mt-8 border-t border-white/15 pt-6">
                      <div className="text-base font-semibold text-white">Lineup slots</div>
                      <p className="mt-1 text-xs text-white/50">
                        One row per slot: start time, who appears on the public lineup (when not booked by a MicStage artist),
                        booking type, Save. Delete removes an empty or house-held slot — not slots with an active artist booking.
                      </p>
                      {!selectedYmd ? (
                        <p className="mt-4 text-sm text-white/55">
                          No night selected — generate dates first, then pick a night from the chips above.
                        </p>
                      ) : templatesForSelectedDay.length > 0 ? (
                        <div className="mt-4 grid gap-6">
                          {templatesForSelectedDay.map(({ template: t, instances }) => (
                            <div key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                                <div className="font-semibold text-white">{t.title}</div>
                                <div className="text-xs text-white/55">
                                  {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–
                                  {minutesToTimeLabel(t.endTimeMin)}
                                </div>
                              </div>
                              <div className="mt-3 grid gap-5">
                                {instances.map((inst) => (
                                  <div key={inst.id}>
                                    <div className="mt-1 rounded-lg border border-white/10 bg-black/25 px-2 sm:px-3">
                                      {inst.slots.map((s) => (
                                        <VenueSlotManagementRow
                                          key={s.id}
                                          venueId={v.id}
                                          slot={s}
                                          template={t}
                                          lineupDay={selectedYmd}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-white/55">
                          No slots for{" "}
                          <span className="text-white/80">{lineupNavLabelFromYmd(selectedYmd)}</span> yet — use{" "}
                          <span className="text-white/75">Each schedule block</span> below, pick this date, and{" "}
                          <span className="text-white/75">Generate slots</span>.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                {!operational ? <VenueProfileForm venue={v} /> : null}

                <div
                  className={
                    operational
                      ? "mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6"
                      : "mt-6 rounded-2xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.06)] p-6 shadow-[0_0_0_1px_rgba(255,45,149,0.12)]"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                        {operational ? "Schedule blocks" : "Schedule"}
                      </div>
                      <h3 className="om-heading mt-2 text-2xl tracking-wide text-white">
                        {operational ? "Manage recurring nights" : "Set weekly schedule"}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm text-white/70">
                        {operational ? (
                          <>
                            Update which nights you run, hours, slot length, and booking window. Re-run anytime — confirmed
                            bookings stay put.
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-white/85">Recommended first step:</span> choose your nights, hours,
                            slot length, and booking window. MicStage creates templates and fills open slots automatically—you can
                            re-run this anytime; confirmed bookings stay put.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <WeeklyScheduleForm
                    venueId={v.id}
                    venueTimeZone={v.timeZone}
                    todayIso={todayIso}
                    horizonDays={hDays}
                    defaultSeriesStart={v.seriesStartDate ? toIsoDateOnly(v.seriesStartDate) : todayIso}
                    defaultSeriesEnd={
                      v.seriesEndDate ? toIsoDateOnly(v.seriesEndDate) : plusDaysIso(hDays)
                    }
                    defaultTitle={v.eventTemplates[0]?.title ?? "Open mic"}
                    defaultPerformanceFormat={v.eventTemplates[0]?.performanceFormat ?? v.performanceFormat}
                    bookingRestrictionMode={v.bookingRestrictionMode}
                    restrictionHoursBefore={v.restrictionHoursBefore ?? 6}
                    onPremiseMaxDistanceMeters={v.onPremiseMaxDistanceMeters ?? 1000}
                  />
                </div>

                {operational ? (
                  <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:bg-white/[0.05]">
                    <summary className="cursor-pointer list-none text-lg font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="underline decoration-white/25 underline-offset-4 hover:decoration-white/50">
                        Add another recurring night (one weekday)
                      </span>
                      <span className="mt-1 block text-sm font-normal text-white/55">
                        One template per weekday. If it already exists, use Manage recurring nights above.
                      </span>
                    </summary>
                    <VenueAddRecurringNightFormFields
                      venue={v}
                      todayIso={todayIso}
                      horizonDays={hDays}
                      plusDaysIso={plusDaysIso}
                      formClassName="mt-4 grid gap-3"
                    />
                  </details>
                ) : (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                          Optional
                        </div>
                        <h3 className="om-heading mt-2 text-xl tracking-wide text-white">Add a recurring night (single weekday)</h3>
                        <p className="mt-2 max-w-2xl text-sm text-white/70">
                          Only if you don’t use the weekly form yet — you can add <span className="text-white/90">one</span>{" "}
                          template per weekday. If that weekday already exists, use{" "}
                          <span className="font-medium text-white/90">Set weekly schedule</span> instead.
                        </p>
                      </div>
                    </div>
                    <VenueAddRecurringNightFormFields
                      venue={v}
                      todayIso={todayIso}
                      horizonDays={hDays}
                      plusDaysIso={plusDaysIso}
                    />
                  </div>
                )}

                {/* Per block: generate dates + house tools */}
                <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                    {operational ? "Blocks" : "One-off"}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {operational ? "Each schedule block" : "Generate slots for one date"}
                  </div>
                  <p className="mt-1 text-sm text-white/60">
                    {operational
                      ? "Pick a block and date, then generate or refresh slots. New nights show up in Lineup & sharing above for editing. Booked slots are never overwritten."
                      : "Use this for a single calendar day without re-running the full window (same safe rules — booked slots are not overwritten)."}
                  </p>
                  {v.eventTemplates.length === 0 ? (
                    <div className="mt-4 text-sm text-white/60">Set a weekly schedule first — no templates yet.</div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {v.eventTemplates.map((t) => (
                        <div key={t.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <div className="font-semibold">{t.title}</div>
                              <div className="mt-0.5 text-xs text-white/55">
                                Format:{" "}
                                <span className="text-white/80">{performanceFormatLabel(t.performanceFormat)}</span>
                              </div>
                            </div>
                            <div className="text-xs text-white/60">
                              {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–{minutesToTimeLabel(t.endTimeMin)} ·{" "}
                              {t.slotMinutes}m + {t.breakMinutes}m
                            </div>
                          </div>
                          <form action={generateDateSchedule} className="mt-3 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="templateId" value={t.id} />
                            <label className="grid gap-1 text-xs">
                              <span className="text-white/60">Date</span>
                              <input
                                name="date"
                                type="date"
                                defaultValue={todayIso}
                                min={v.seriesStartDate ? toIsoDateOnly(v.seriesStartDate) : todayIso}
                                max={v.seriesEndDate ? toIsoDateOnly(v.seriesEndDate) : plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                                className="h-10 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white"
                              />
                            </label>
                            <FormSubmitButton
                              label="Generate slots"
                              pendingLabel="Generating…"
                              className="h-10 rounded-md bg-[rgb(var(--om-neon))] px-3 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
                            />
                          </form>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {operational ? (
                  <details
                    id={`venue-profile-${v.id}`}
                    className="group mt-8 scroll-mt-28 rounded-2xl border border-white/10 bg-black/25 p-5 open:border-white/15 open:bg-black/35"
                  >
                    <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-semibold text-white underline decoration-white/20 underline-offset-4 group-open:decoration-[rgb(var(--om-neon))]/50">
                          Edit venue info
                        </span>
                        <span className="text-sm text-white/50">Profile, images, gear, socials, plan</span>
                      </div>
                    </summary>
                    <VenueProfileForm venue={v} emphasis="secondary" />
                  </details>
                ) : null}

                {session.venueOwnerId ? (
                  <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-black/30 p-5">
                    <div>
                      <div className="text-sm font-semibold">Invite a manager (optional)</div>
                      <div className="mt-1 text-xs text-white/60">
                        Managers can help maintain schedules. For now, set a temp password they use to log in at Venue login.
                      </div>
                    </div>
                    <form action={inviteManager} className="grid gap-3 md:grid-cols-3">
                      <input type="hidden" name="venueId" value={v.id} />
                      <label className="grid gap-1 text-sm md:col-span-2">
                        <span className="text-white/80">Manager email</span>
                        <input
                          name="managerEmail"
                          type="email"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="manager@venue.com"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-white/80">Temp password</span>
                        <input
                          name="tempPassword"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="Temp password"
                        />
                      </label>
                      <FormSubmitButton
                        label="Add manager"
                        pendingLabel="Saving…"
                        className="h-11 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60 md:col-span-3"
                      />
                    </form>
                  </div>
                ) : null}
              </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

