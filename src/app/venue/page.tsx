import Link from "next/link";
import type { Venue } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";
import { requirePrisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { VENUE_DASHBOARD_HREF } from "@/lib/safeRedirect";
import {
  createEventTemplate,
  generateDateSchedule,
  houseBookSlot,
  inviteManager,
  updateSlotBookingRules,
} from "./actions";
import { BOOKING_RESTRICTION_OPTIONS } from "@/lib/bookingRestrictionUi";
import { slotHasBookingRuleOverride } from "@/lib/slotBookingEffective";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { VENUE_PERFORMANCE_FORMAT_OPTIONS } from "@/lib/venuePerformanceFormat";
import { minutesToTimeLabel, toIsoDateOnly, weekdayToLabel } from "@/lib/time";
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
    slotRule?: string;
  }>;
}) {
  const q = await searchParams;
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
              <span className="text-white/85">Start here:</span> save your weekly schedule (below), then generate dates—your
              public venue page updates as you go. Signed in as <span className="font-mono">{session.email}</span>
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
            <span className="font-semibold text-emerald-100/95">Profile saved.</span> Your public venue page shows this
            info—refresh the page if you don&apos;t see changes yet. Next: set or update your weekly schedule so artists can
            book.
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
        {q.slotRule === "saved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Slot booking rule updated.</span> Public booking uses this
            rule for that slot unless you reset it to the schedule default.
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
            {venues.map((v) => (
              <section key={v.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue</div>
                    <h2 className="mt-2 text-2xl font-semibold">{v.name}</h2>
                    <div className="mt-1 text-sm text-white/70">{v.formattedAddress}</div>
                    <div className="mt-2 text-xs text-white/60">
                      Public page:{" "}
                      <Link className="underline" href={`/venues/${v.slug}`}>
                        /venues/{v.slug}
                      </Link>
                    </div>
                  </div>
                </div>

                <VenueProfileForm venue={v} />

                {/* Primary: weekly schedule + bulk slot generation */}
                <div className="mt-6 rounded-2xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.06)] p-6 shadow-[0_0_0_1px_rgba(255,45,149,0.12)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                        Schedule
                      </div>
                      <h3 className="om-heading mt-2 text-2xl tracking-wide text-white">Set weekly schedule</h3>
                      <p className="mt-2 max-w-2xl text-sm text-white/70">
                        <span className="font-medium text-white/85">Recommended first step:</span> choose your nights, hours,
                        slot length, and booking window. MicStage creates templates and fills open slots automatically—you can
                        re-run this anytime; confirmed bookings stay put.
                      </p>
                    </div>
                  </div>
                  <WeeklyScheduleForm
                    venueId={v.id}
                    venueTimeZone={v.timeZone}
                    todayIso={todayIso}
                    horizonDays={horizonDaysFor(v.subscriptionTier)}
                    defaultSeriesStart={v.seriesStartDate ? toIsoDateOnly(v.seriesStartDate) : todayIso}
                    defaultSeriesEnd={
                      v.seriesEndDate
                        ? toIsoDateOnly(v.seriesEndDate)
                        : plusDaysIso(horizonDaysFor(v.subscriptionTier))
                    }
                    defaultTitle={v.eventTemplates[0]?.title ?? "Open mic"}
                    defaultPerformanceFormat={v.eventTemplates[0]?.performanceFormat ?? v.performanceFormat}
                    bookingRestrictionMode={v.bookingRestrictionMode}
                    restrictionHoursBefore={v.restrictionHoursBefore ?? 6}
                    onPremiseMaxDistanceMeters={v.onPremiseMaxDistanceMeters ?? 1000}
                  />
                </div>

                {/* Optional: second recurring night on the same weekday or different rules */}
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                        Optional
                      </div>
                      <h3 className="om-heading mt-2 text-xl tracking-wide text-white">Add a recurring night (single weekday)</h3>
                      <p className="mt-2 max-w-2xl text-sm text-white/70">
                        Only if you don’t use the weekly form yet — you can add <span className="text-white/90">one</span> template
                        per weekday. If that weekday already exists, use{" "}
                        <span className="font-medium text-white/90">Set weekly schedule</span> instead.
                      </p>
                    </div>
                  </div>

                  <form action={createEventTemplate} className="mt-6 grid gap-3">
                      <input type="hidden" name="venueId" value={v.id} />
                      <label className="grid gap-1 text-sm">
                        <span className="text-white/80">Open mic night name (public)</span>
                        <input
                          name="title"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="Monday Songwriter Night"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">
                            Booking window start (today onward)
                          </span>
                          <input
                            name="seriesStartDate"
                            type="date"
                            min={todayIso}
                            max={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            defaultValue={todayIso}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">
                            Booking window end (max {horizonDaysFor(v.subscriptionTier)} days out)
                          </span>
                          <input
                            name="seriesEndDate"
                            type="date"
                            min={todayIso}
                            max={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            defaultValue={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Weekday</span>
                          <select name="weekday" className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white">
                            <option value="MON">Monday</option>
                            <option value="TUE">Tuesday</option>
                            <option value="WED">Wednesday</option>
                            <option value="THU">Thursday</option>
                            <option value="FRI">Friday</option>
                            <option value="SAT">Saturday</option>
                            <option value="SUN">Sunday</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Time zone (auto from venue location)</span>
                          <input
                            name="timeZone"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                            defaultValue={v.timeZone}
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Start time</span>
                          <input
                            name="startTime"
                            type="time"
                            required
                            defaultValue="17:00"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">End time</span>
                          <input
                            name="endTime"
                            type="time"
                            required
                            defaultValue="21:00"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Slot minutes</span>
                          <input
                            name="slotMinutes"
                            type="number"
                            min={1}
                            defaultValue={25}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Break minutes</span>
                          <input
                            name="breakMinutes"
                            type="number"
                            min={0}
                            defaultValue={5}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1 text-sm">
                        <span className="text-white/80">Performance format (this night, public)</span>
                        <select
                          name="performanceFormat"
                          defaultValue={v.performanceFormat}
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                        >
                          {VENUE_PERFORMANCE_FORMAT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
                        <legend className="text-sm font-semibold text-white">Booking release rules (for this time block)</legend>

                        <div className="grid gap-2">
                          {BOOKING_RESTRICTION_OPTIONS.map((o) => (
                            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
                              <input
                                type="radio"
                                name="bookingRestrictionMode"
                                value={o.value}
                                defaultChecked={v.bookingRestrictionMode === o.value}
                                className="h-4 w-4 accent-[rgb(var(--om-neon))]"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/80">X hours before start</span>
                            <input
                              name="restrictionHoursBefore"
                              type="number"
                              min={0}
                              max={48}
                              defaultValue={v.restrictionHoursBefore ?? 6}
                              required
                              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/80">On-premise radius (meters)</span>
                            <input
                              name="onPremiseMaxDistanceMeters"
                              type="number"
                              min={50}
                              max={10000}
                              defaultValue={v.onPremiseMaxDistanceMeters ?? 1000}
                              required
                              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                            />
                          </label>
                        </div>

                        <p className="text-xs text-white/50">
                          These rules apply to every generated slot inside this template (each template is a “time block”).
                        </p>
                      </fieldset>

                    <FormSubmitButton
                      label="Save available times"
                      pendingLabel="Saving…"
                      className="mt-2 h-11 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
                    />
                  </form>
                </div>

                {/* One-off: single date */}
                <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                    One-off
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">Generate slots for one date</div>
                  <p className="mt-1 text-sm text-white/60">
                    Use this for a single calendar day without re-running the full window (same safe rules — booked slots are not
                    overwritten).
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

                          {t.instances.length ? (
                            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                              <div className="text-sm font-semibold text-white/80">House bookings</div>
                              <div className="mt-3 grid gap-4">
                                {t.instances.map((inst) => (
                                  <div key={inst.id}>
                                    <div className="text-xs text-white/60">For {inst.date.toISOString().slice(0, 10)}</div>
                                    <div className="mt-2 grid gap-2">
                                      {inst.slots.map((s) => {
                                        const activeBooking = s.booking && !s.booking.cancelledAt ? s.booking : null;
                                        const overridden = slotHasBookingRuleOverride(s);
                                        return (
                                          <div
                                            key={s.id}
                                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-3"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <div className="text-sm">
                                                <span className="font-semibold">
                                                  {minutesToTimeLabel(s.startMin)}–{minutesToTimeLabel(s.endMin)}
                                                </span>
                                                <span className="ml-2 text-white/70">
                                                  {activeBooking ? `Booked: ${activeBooking.performerName}` : "Open slot"}
                                                </span>
                                              </div>
                                              {activeBooking ? null : (
                                                <form action={houseBookSlot} className="flex flex-wrap items-center gap-2">
                                                  <input type="hidden" name="venueId" value={v.id} />
                                                  <input type="hidden" name="slotId" value={s.id} />
                                                  <input
                                                    name="performerName"
                                                    required
                                                    placeholder="Artist / stage name"
                                                    className="h-9 w-40 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white placeholder:text-white/40"
                                                  />
                                                  <FormSubmitButton
                                                    label="House book"
                                                    pendingLabel="Booking…"
                                                    className="h-9 rounded-md bg-[rgb(var(--om-neon))] px-3 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
                                                  />
                                                </form>
                                              )}
                                            </div>
                                            <div className="mt-2 border-t border-white/10 pt-2">
                                              <div className="text-[11px] text-white/45">
                                                {overridden ? (
                                                  <span>
                                                    <span className="font-medium text-amber-200/90">Custom booking rule</span> on
                                                    this slot (public booking follows this, not the template default).
                                                  </span>
                                                ) : (
                                                  <span>
                                                    Using <span className="text-white/65">schedule block default</span> for
                                                    booking release.
                                                  </span>
                                                )}
                                              </div>
                                              <form action={updateSlotBookingRules} className="mt-2 grid gap-2 sm:grid-cols-2">
                                                <input type="hidden" name="venueId" value={v.id} />
                                                <input type="hidden" name="slotId" value={s.id} />
                                                <label className="grid gap-1 text-xs sm:col-span-2">
                                                  <span className="text-white/55">Booking release for this slot</span>
                                                  <select
                                                    name="slotBookingRule"
                                                    defaultValue={
                                                      s.bookingRestrictionModeOverride ?? "inherit"
                                                    }
                                                    className="h-9 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white"
                                                  >
                                                    <option value="inherit">Same as schedule block (default)</option>
                                                    {BOOKING_RESTRICTION_OPTIONS.map((o) => (
                                                      <option key={o.value} value={o.value}>
                                                        {o.label}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </label>
                                                <label className="grid gap-1 text-xs">
                                                  <span className="text-white/55">Hours before start (X)</span>
                                                  <input
                                                    name="restrictionHoursBefore"
                                                    type="number"
                                                    min={0}
                                                    max={48}
                                                    defaultValue={
                                                      s.restrictionHoursBeforeOverride ?? t.restrictionHoursBefore
                                                    }
                                                    className="h-9 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white"
                                                  />
                                                </label>
                                                <label className="grid gap-1 text-xs">
                                                  <span className="text-white/55">On-premise radius (m)</span>
                                                  <input
                                                    name="onPremiseMaxDistanceMeters"
                                                    type="number"
                                                    min={50}
                                                    max={10000}
                                                    defaultValue={
                                                      s.onPremiseMaxDistanceMetersOverride ??
                                                      t.onPremiseMaxDistanceMeters
                                                    }
                                                    className="h-9 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white"
                                                  />
                                                </label>
                                                <FormSubmitButton
                                                  label="Apply slot rule"
                                                  pendingLabel="Saving…"
                                                  className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60 sm:col-span-2"
                                                />
                                              </form>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

