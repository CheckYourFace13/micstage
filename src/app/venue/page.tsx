import Link from "next/link";
import type { Venue } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import { getVenueSessionOrNull, venueIdsForSession } from "@/lib/authz";
import { VENUE_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { VenueInviteManagerForm } from "./VenueInviteManagerForm";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { absoluteUrl } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd, minutesToTimeLabel, toIsoDateOnly, weekdayToLabel } from "@/lib/time";
import { isValidLineupYmd, pickPrimaryLineup, storageYmdUtc } from "@/lib/venuePublicLineup";
import type { LineupTemplate } from "@/lib/venuePublicLineupData";
import { loadLineupTemplatesByVenueIds, venueIsOperational } from "@/lib/venueDashboardOperational";
import {
  loadVenuePerformerHistoryDashboardEnriched,
  loadVenuePerformerSuggestions,
} from "@/lib/venuePerformerHistory";
import { VenueDashboardShareBar } from "@/components/venue/VenueDashboardShareBar";
import { VenueOpenMicQrCode } from "@/components/venues/VenueOpenMicQrCode";
import { VenueBulkMessagePanel } from "@/components/venue/VenueBulkMessagePanel";
import { VenueTestLineupCleanupPanel } from "@/components/venue/VenueTestLineupCleanupPanel";
import { VenueDeleteOpenMicDayPanel } from "@/components/venue/VenueDeleteOpenMicDayPanel";
import { VenuePerformerHistoryPanel } from "@/components/venue/VenuePerformerHistoryPanel";
import { VenueSlotManagementRow } from "@/components/venue/VenueSlotManagementRow";
import { VenueAddRecurringNightFormFields } from "./VenueAddRecurringNightForm";
import { VenueProfileForm } from "./VenueProfileForm";
import { WeeklyScheduleForm } from "./WeeklyScheduleForm";
import { isVenueLineupTestCleanupUiEnabled } from "@/lib/venueTestLineupCleanup";

type VenueScheduleTemplateInclude = {
  instances: {
    where: { date: { gte: Date } };
    orderBy: { date: "asc" };
    take: number;
    include: { slots: { orderBy: { startMin: "asc" }; include: { booking: true } } };
  };
};

function utcStartOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function venueScheduleTemplateIncludeAtRequest(): VenueScheduleTemplateInclude {
  return {
    instances: {
      // Instance dates are stored at UTC midnight for the venue-calendar day.
      // Filter from UTC start-of-day (not "right now") so today's night remains selectable/editable.
      where: { date: { gte: utcStartOfToday() } },
      orderBy: { date: "asc" },
      take: 90,
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

async function loadVenuePortalRows(session: NonNullable<Awaited<ReturnType<typeof getVenueSessionOrNull>>>): Promise<{
  venues: VenuePortalRow[];
  loadError: "none" | "requirePrisma" | "venueList";
  performerSuggestionsByVenueId: Record<string, Awaited<ReturnType<typeof loadVenuePerformerSuggestions>>>;
  performerHistoryByVenueId: Record<string, Awaited<ReturnType<typeof loadVenuePerformerHistoryDashboardEnriched>>>;
}> {
  let prisma: ReturnType<typeof requirePrisma>;
  try {
    prisma = requirePrisma();
  } catch (e) {
    logVenuePortalFailure("requirePrisma", e);
    return {
      venues: [],
      loadError: "requirePrisma",
      performerSuggestionsByVenueId: {},
      performerHistoryByVenueId: {},
    };
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
      return {
        venues: [],
        loadError: "venueList",
        performerSuggestionsByVenueId: {},
        performerHistoryByVenueId: {},
      };
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

  const performerSuggestionsByVenueId: Record<string, Awaited<ReturnType<typeof loadVenuePerformerSuggestions>>> = {};
  const performerHistoryByVenueId: Record<string, Awaited<ReturnType<typeof loadVenuePerformerHistoryDashboardEnriched>>> = {};
  if (venueIds.length > 0) {
    try {
      for (const id of venueIds) {
        performerSuggestionsByVenueId[id] = await loadVenuePerformerSuggestions(prisma, id);
        performerHistoryByVenueId[id] = await loadVenuePerformerHistoryDashboardEnriched(prisma, id);
      }
    } catch (e) {
      logVenuePortalFailure("performer history / suggestions", e);
    }
  }

  return { venues, loadError: "none", performerSuggestionsByVenueId, performerHistoryByVenueId };
}

export const metadata = {
  title: "Venue portal | MicStage",
};

export const dynamic = "force-dynamic";

/** Preserve flash/query params when switching `lineupDay` from the dashboard. */
const VENUE_DASHBOARD_EPHEMERAL_QUERY_KEYS = new Set([
  "lineupDay",
  "lineupTestCleanup",
  "lineupTestCleanupError",
  "ltcScope",
  "ltcYmd",
  "ltcBookings",
  "ltcManual",
  "ltcAvail",
  "ltcHistDel",
  "ltcHistDec",
  "ltcInst",
  "ltcSlots",
]);

function venueDashboardChipHref(
  preserved: Record<string, string | undefined>,
  ymd: string,
): string {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(preserved)) {
    if (val == null || val === "" || VENUE_DASHBOARD_EPHEMERAL_QUERY_KEYS.has(key)) continue;
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
    dayDeleted?: string;
    dayDeleteError?: string;
    performerHistory?: string;
    lineupTestCleanup?: string;
    lineupTestCleanupError?: string;
    ltcScope?: string;
    ltcYmd?: string;
    ltcBookings?: string;
    ltcManual?: string;
    ltcAvail?: string;
    ltcHistDel?: string;
    ltcHistDec?: string;
    ltcInst?: string;
    ltcSlots?: string;
    bulkMsg?: string;
    sent?: string;
    failed?: string;
  }>;
}) {
  const q = await searchParams;
  const preservedQuery: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(q).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const session = await getVenueSessionOrNull();
  if (!session) {
    throw new Error("Expected venue auth guard middleware for /venue.");
  }
  const { venues, loadError, performerSuggestionsByVenueId, performerHistoryByVenueId } =
    await loadVenuePortalRows(session);

  if (loadError === "requirePrisma" || loadError === "venueList") {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
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
          </div>
          <p className="mt-4 text-xs text-white/50">
            Use the MicStage header for Home, search, and sign out.
          </p>
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

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue portal</div>
          <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Venue dashboard</h1>
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
        </div>

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
        {q.profile === "imageUploaded" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Image uploaded.</span> It is saved on your profile. You can still
            edit the URL field and save if you want to switch to a different image.
          </div>
        ) : null}
        {q.profileError === "uploadMissing" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Choose an image file before uploading.
          </div>
        ) : null}
        {q.profileError === "invalidForm" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That upload could not be completed. Refresh the page and try again.
          </div>
        ) : null}
        {q.profileError === "upload_unsupported_type" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That file type is not supported. Use JPEG, PNG, WebP, or GIF.
          </div>
        ) : null}
        {q.profileError === "upload_too_large" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That file is too large (max about 2.5MB). Try a smaller image.
          </div>
        ) : null}
        {q.profileError === "upload_blob_failed" || q.profileError === "upload_local_write_failed" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Upload storage failed. Try again in a moment; if it keeps happening, contact support.
          </div>
        ) : null}
        {q.profileError === "upload_uploads_not_configured" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            File uploads are not enabled on this server. Paste an image URL instead, or ask your host to configure blob storage.
          </div>
        ) : null}
        {q.profileError === "duplicateWeekday" || q.scheduleError === "duplicateWeekday" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            You already have a schedule for that weekday. Use{" "}
            <span className="font-semibold text-white">Schedule Open Mic</span> below to change it — MicStage keeps one
            template per weekday per venue.
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
        {q.scheduleError === "submitFailed" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Schedule save failed before MicStage received a complete response. Please try again.
          </div>
        ) : null}
        {q.scheduleError === "boundsCalc" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            MicStage could not validate your booking window dates on the server. Hard refresh the page (Ctrl+Shift+R) and try
            again; if it persists, contact support with your venue timezone.
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
            <span className="font-semibold text-emerald-100/95">Recurring night added.</span> Use{" "}
            <span className="font-medium text-white">Schedule Open Mic</span> above to align slots with your booking window.
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
        {q.venueError === "featureDisabled" ? (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-50">
            Lineup test cleanup is disabled in this environment. For production, set{" "}
            <code className="text-amber-200/90">VENUE_ALLOW_LINEUP_TEST_CLEANUP=true</code> if you need it.
          </div>
        ) : null}
        {q.lineupTestCleanup === "ok" ? (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-amber-100">Lineup test cleanup finished.</span> Scope:{" "}
            <span className="font-mono text-xs text-white/80">{q.ltcScope ?? "?"}</span>
            {q.ltcYmd ? (
              <>
                {" "}
                · night <span className="font-mono text-xs text-white/80">{q.ltcYmd}</span>
              </>
            ) : null}
            . Bookings removed: {q.ltcBookings ?? "0"}, manual labels cleared: {q.ltcManual ?? "0"}, slots freed (RESERVED→
            AVAILABLE): {q.ltcAvail ?? "0"}, performer history rows deleted: {q.ltcHistDel ?? "0"}, decremented:{" "}
            {q.ltcHistDec ?? "0"} (instances touched: {q.ltcInst ?? "0"}, slots scanned: {q.ltcSlots ?? "0"}).
          </div>
        ) : null}
        {q.lineupTestCleanupError === "confirm" ? (
          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-50">
            Confirmation phrase did not match for <strong>selected night</strong>. Type exactly:{" "}
            <code className="text-red-100/90">CLEAR LINEUP TEST DATA</code>
          </div>
        ) : null}
        {q.lineupTestCleanupError === "confirmVenue" ? (
          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-50">
            Confirmation phrase did not match for <strong>entire venue</strong>. Type exactly:{" "}
            <code className="text-red-100/90">CLEAR ALL LINEUP DATA FOR THIS VENUE</code>
          </div>
        ) : null}
        {q.lineupTestCleanupError === "needDay" ? (
          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-50">
            Select a night from the date chips before running cleanup for <strong>selected night only</strong>, or choose{" "}
            <strong>entire venue</strong>.
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
            <span className="font-semibold text-emerald-100/95">Lineup row saved.</span> Times, artist assignment, and booking
            type are updated for that slot.
          </div>
        ) : null}
        {q.performerHistory === "toggled" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Performer list updated.</span> Public venue page visibility for
            that manual name was saved.
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
        {q.dayDeleted === "1" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            That open mic night was removed from MicStage (templates unchanged). Slots and walk-up holds on that date are gone.
          </div>
        ) : null}
        {q.dayDeleteError === "musicianBooked" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That night still has an active MicStage artist booking — cancel it first, then you can delete the night.
          </div>
        ) : null}
        {q.dayDeleteError === "noInstances" ? (
          <div className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
            That night was already removed or isn&apos;t on your dashboard. Refresh if this looks wrong.
          </div>
        ) : null}
        {q.bulkMsg === "sent" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Bulk message sent.</span> Delivered to{" "}
            <span className="font-mono text-white/90">{q.sent ?? "0"}</span> artist
            {q.sent === "1" ? "" : "s"} with MicStage accounts (each has a thread + email).
          </div>
        ) : null}
        {q.bulkMsg === "partial" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-amber-100/95">Partial send.</span> Sent:{" "}
            <span className="font-mono">{q.sent ?? "0"}</span>, failed:{" "}
            <span className="font-mono">{q.failed ?? "?"}</span>. Check logs or retry for missing recipients.
          </div>
        ) : null}
        {q.bulkMsg === "norecipients" ? (
          <div className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
            No booked artists with MicStage accounts on that date.
          </div>
        ) : null}
        {q.bulkMsg === "invalid" || q.bulkMsg === "forbidden" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Could not send bulk message ({q.bulkMsg}). Refresh and try again.
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
              const managedYmds = new Set(
                v.eventTemplates.flatMap((t) => t.instances.map((i) => storageYmdUtc(i.date))),
              );
              const generatedDayYmds = [...managedYmds].sort();
              const primaryYmd = primary ? storageYmdUtc(primary.instance.date) : null;
              const heroYmd =
                primaryYmd && generatedDayYmds.includes(primaryYmd)
                  ? primaryYmd
                  : generatedDayYmds[0] ?? null;
              const rawLineupDay = typeof q.lineupDay === "string" ? q.lineupDay.trim() : "";
              const selectedYmd =
                rawLineupDay && isValidLineupYmd(rawLineupDay) && managedYmds.has(rawLineupDay)
                  ? rawLineupDay
                  : heroYmd;
              const lineupPath = selectedYmd ? `/venues/${v.slug}/lineup/${selectedYmd}` : null;
              const hDays = horizonDaysFor(v.subscriptionTier);
              // Horizon date depends on "today" — intentional for booking-window UI (not derived from external snapshot).
              const bookingWindowMaxIso = toIsoDateOnly(
                // eslint-disable-next-line react-hooks/purity -- booking window is intentionally relative to render time
                new Date(Date.now() + hDays * 24 * 60 * 60 * 1000),
              );
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
              <section key={v.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
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

                <div className="mt-6">
                  <VenueOpenMicQrCode
                    variant="dashboard"
                    venueName={v.name}
                    publicPageUrl={absoluteUrl(`/venues/${v.slug}`)}
                    hint={
                      v.eventTemplates.length === 0
                        ? "Publish at least one weekly open mic night so this page shows a bookable lineup; the QR still opens your public MicStage venue hub."
                        : null
                    }
                  />
                </div>

                {operational ? (
                  <div className="mt-8 rounded-2xl border border-[rgba(var(--om-neon),0.55)] bg-gradient-to-b from-[rgba(var(--om-neon),0.12)] to-black/35 p-4 sm:p-7">
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

                    {generatedDayYmds.length > 0 ? (
                      <div className="mt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                          Open mic nights (generated)
                        </div>
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          role="tablist"
                          aria-label="Select which night to manage"
                        >
                          {generatedDayYmds.map((ymd) => {
                            const isSelected = ymd === selectedYmd;
                            return (
                              <Link
                                key={ymd}
                                href={venueDashboardChipHref(preservedQuery, ymd)}
                                scroll={false}
                                role="tab"
                                aria-selected={isSelected}
                                className={`rounded-full border px-3 py-2 text-xs transition-colors min-h-10 sm:min-h-0 sm:py-1.5 ${
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

                    {generatedDayYmds.length > 0 && isVenueLineupTestCleanupUiEnabled() ? (
                      <VenueTestLineupCleanupPanel
                        venueId={v.id}
                        selectedYmd={selectedYmd}
                        selectedNightLabel={selectedYmd ? lineupNavLabelFromYmd(selectedYmd) : null}
                      />
                    ) : null}

                    {selectedYmd && lineupPath ? (
                      <>
                        <div className="mt-6 border-l-2 border-[rgb(var(--om-neon))]/60 pl-4">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--om-neon))]/90">
                            Selected night
                          </div>
                          <div className="mt-1">
                            <VenueDeleteOpenMicDayPanel
                              venueId={v.id}
                              dateYmd={selectedYmd}
                              nightLabel={lineupNavLabelFromYmd(selectedYmd)}
                            >
                              <div className="text-lg font-semibold tracking-tight text-white">
                                {lineupNavLabelFromYmd(selectedYmd)}
                              </div>
                            </VenueDeleteOpenMicDayPanel>
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
                        <VenueBulkMessagePanel
                          venueId={v.id}
                          dateYmds={generatedDayYmds}
                          defaultYmd={selectedYmd}
                        />
                      </>
                    ) : (
                      <p className="mt-6 text-sm text-white/65">
                        No generated open mic nights yet. Use <span className="text-white/80">Schedule Open Mic</span> below to
                        use <span className="text-white/80">Schedule setup</span> below — nights with real lineups appear
                        here as chips.
                      </p>
                    )}

                    <div className="mt-8 border-t border-white/15 pt-6">
                      <div className="text-base font-semibold text-white">Lineup slots</div>
                      <p className="mt-1 text-xs text-white/50">
                        Start time, then artist: MicStage accounts show in search; you can still type a manual name. Slots with
                        an active artist booking are read-only for the name. Save updates the row; Delete skips booked artist
                        slots.
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
                                <div>
                                  <div className="font-semibold text-white">{t.title}</div>
                                  {t.description ? (
                                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/50">{t.description}</p>
                                  ) : null}
                                </div>
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
                                          performerSuggestions={performerSuggestionsByVenueId[v.id] ?? []}
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
                          <span className="text-white/75">Schedule setup</span>.
                        </p>
                      )}
                    </div>

                    <div className="mt-8 border-t border-white/15 pt-6">
                      <div className="text-base font-semibold text-white">Previous performers at this venue</div>
                      <p className="mt-1 max-w-xl text-xs text-white/50">
                        Rows come from lineup activity; counts and dates use confirmed MicStage bookings at this venue.
                        Linked artist accounts get a public search link, cross-venue totals, and a full performance timeline.
                        Manual names stay plain text until linked; use Show/Hide to control the public venue page list.
                      </p>
                      <VenuePerformerHistoryPanel
                        venueId={v.id}
                        rows={performerHistoryByVenueId[v.id] ?? []}
                      />
                    </div>
                  </div>
                ) : null}

                {!operational ? <VenueProfileForm venue={v} /> : null}

                <div
                  className={
                    operational
                      ? "mt-8 rounded-xl border border-white/10 bg-black/30 p-5 sm:p-6"
                      : "mt-6 rounded-2xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.06)] p-6 shadow-[0_0_0_1px_rgba(255,45,149,0.12)]"
                  }
                >
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                    Schedule Open Mic
                  </div>
                  <h3 className="om-heading mt-2 text-xl font-bold tracking-wide text-white sm:text-2xl">
                    {operational ? "Plan your open mic nights" : "Set up your open mic & generate slots"}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/65">
                    {operational ? (
                      <>
                        Name the night, add a short note for artists, choose one date or a recurring pattern, then save. MicStage
                        builds the slot grid from your venue’s time zone. New nights appear under{" "}
                        <span className="text-white/80">Lineup & sharing</span> above. Booked slots are never overwritten.
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-white/85">Start here:</span> describe the open mic, pick a single date
                        or weekly nights, set times and rules, then generate slots. Re-run anytime; confirmed bookings stay put.
                      </>
                    )}
                  </p>

                  <div className="mt-6 border-t border-white/10 pt-6">
                    <h4 className="text-base font-semibold text-white">Schedule setup</h4>
                    <p className="mt-1 max-w-2xl text-sm text-white/55">
                      One-off or recurring: MicStage saves one template per weekday you use and fills slots in your booking
                      window.
                    </p>
                    <WeeklyScheduleForm
                      venueId={v.id}
                      venueTimeZone={v.timeZone}
                      todayIso={todayIso}
                      horizonDays={hDays}
                      defaultSeriesStart={v.seriesStartDate ? toIsoDateOnly(v.seriesStartDate) : todayIso}
                      defaultSeriesEnd={
                        v.seriesEndDate ? toIsoDateOnly(v.seriesEndDate) : bookingWindowMaxIso
                      }
                      defaultTitle={v.eventTemplates[0]?.title ?? "Open mic"}
                      defaultDescription={v.eventTemplates[0]?.description ?? ""}
                      defaultPerformanceFormat={v.eventTemplates[0]?.performanceFormat ?? v.performanceFormat}
                      bookingRestrictionMode={v.bookingRestrictionMode}
                      restrictionHoursBefore={v.restrictionHoursBefore ?? 6}
                      onPremiseMaxDistanceMeters={v.onPremiseMaxDistanceMeters ?? 1000}
                      formClassName="mt-4 grid gap-4"
                    />
                  </div>
                </div>

                {operational ? (
                  <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:bg-white/[0.05]">
                    <summary className="cursor-pointer list-none text-lg font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="underline decoration-white/25 underline-offset-4 hover:decoration-white/50">
                        Add another recurring night (one weekday)
                      </span>
                      <span className="mt-1 block text-sm font-normal text-white/55">
                        One template per weekday. If it already exists, update it with{" "}
                        <span className="text-white/70">Schedule setup</span> above.
                      </span>
                    </summary>
                    <VenueAddRecurringNightFormFields
                      venue={v}
                      todayIso={todayIso}
                      horizonDays={hDays}
                      bookingWindowMaxIso={bookingWindowMaxIso}
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
                          <span className="font-medium text-white/90">Schedule setup</span> instead.
                        </p>
                      </div>
                    </div>
                    <VenueAddRecurringNightFormFields
                      venue={v}
                      todayIso={todayIso}
                      horizonDays={hDays}
                      bookingWindowMaxIso={bookingWindowMaxIso}
                    />
                  </div>
                )}

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
                    <VenueInviteManagerForm venueId={v.id} />
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

