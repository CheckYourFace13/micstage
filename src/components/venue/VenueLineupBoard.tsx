import Link from "next/link";
import { bookSlot, cancelBooking } from "@/app/venues/[venueSlug]/actions";
import type { Session } from "@/lib/session";
import { bookingBlockReason, slotRestrictionBlockReason, slotStartInstant } from "@/lib/venueBookingRules";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { effectiveSlotRestriction } from "@/lib/slotBookingEffective";
import type { PublicVenueForLineup } from "@/lib/venuePublicLineupData";
import type { LineupBadge, LineupForDateRow } from "@/lib/venuePublicLineup";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import OnPremiseReserveButton from "@/components/OnPremiseReserveButton";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { absoluteUrl } from "@/lib/publicSeo";
import { publicSlotArtistLabel } from "@/lib/slotDisplay";

type Props = {
  venue: PublicVenueForLineup;
  lineups: LineupForDateRow[];
  ymd: string;
  now: Date;
  session: Session | null;
  venueStaffVenueIds: string[];
  isMusician: boolean;
  /** Post-booking / cancel redirect target (must stay under this venue). */
  returnPath: string;
  reserve?: string;
  embed?: boolean;
  /** Shown above the first panel (e.g. Live now / Tonight / Upcoming) */
  heroBadge?: LineupBadge | null;
  /** Show canonical + embed links (hidden in embed mode) */
  showShareStrip?: boolean;
};

function badgeLabel(b: LineupBadge): string {
  if (b === "live") return "Live now";
  if (b === "tonight") return "Tonight";
  return "Upcoming";
}

function reserveReturnPath(returnPath: string, slotId: string): string {
  const joiner = returnPath.includes("?") ? "&" : "?";
  return `${returnPath}${joiner}reserve=${encodeURIComponent(slotId)}`;
}

const performPrimaryClass =
  "inline-flex h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7.5rem]";
const performCompleteClass =
  "inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-400 px-4 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7.5rem]";

export function VenueLineupBoard({
  venue,
  lineups,
  ymd,
  now,
  session,
  venueStaffVenueIds,
  isMusician,
  returnPath,
  reserve,
  embed,
  heroBadge,
  showShareStrip,
}: Props) {
  const isVenueStaffHere =
    session?.kind === "venue" && venueStaffVenueIds.includes(venue.id);

  const canonicalPath = `/venues/${venue.slug}/lineup/${ymd}`;
  const canonicalUrl = absoluteUrl(canonicalPath);
  const embedUrl = `${canonicalUrl}?embed=1`;
  const apiUrl = absoluteUrl(`/api/public/venues/${venue.slug}/lineup?date=${ymd}`);

  return (
    <div className={embed ? "" : "space-y-6"}>
      {heroBadge ? (
        <div className="inline-flex items-center rounded-full border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.12)] px-3 py-1 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--om-neon))]">
          {badgeLabel(heroBadge)}
        </div>
      ) : null}

      {showShareStrip && !embed ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
          <div className="font-medium text-white/90">Share this lineup</div>
          <p className="mt-1 text-xs text-white/55">
            Canonical link (best for Facebook / posts):{" "}
            <Link className="break-all text-[rgb(var(--om-neon))] underline" href={canonicalPath}>
              {canonicalUrl}
            </Link>
          </p>
          <p className="mt-2 text-xs text-white/55">
            Embed on your site (iframe): append <span className="font-mono text-white/75">?embed=1</span> —{" "}
            <span className="font-mono text-white/75 break-all">{embedUrl}</span>
          </p>
          <p className="mt-2 text-xs text-white/55">
            JSON: <span className="font-mono break-all text-white/75">{apiUrl}</span>
          </p>
        </div>
      ) : null}

      {lineups.length === 0 ? (
        <p className="text-base text-white/65">No published lineup for this date yet.</p>
      ) : (
        <div className="space-y-8">
          {lineups.map(({ template: t, instance: inst }) => {
            const instanceBookBlock = bookingBlockReason(venue, inst.date);
            const instanceCancelled = inst.isCancelled;
            return (
              <section
                key={inst.id}
                className="overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-black/40 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
              >
                <header className="border-b border-white/10 px-4 py-4 sm:px-5">
                  <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">{t.title}</h2>
                  <p className="mt-1 text-sm text-white/65">
                    {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–{minutesToTimeLabel(t.endTimeMin)} ·{" "}
                    {t.slotMinutes} min slots
                    {t.breakMinutes ? ` · ${t.breakMinutes} min breaks` : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {performanceFormatLabel(t.performanceFormat)}
                  </p>
                </header>

                {instanceCancelled ? (
                  <p className="px-4 py-4 text-sm text-amber-200/90 sm:px-5">This date was cancelled.</p>
                ) : instanceBookBlock ? (
                  <p className="px-4 py-4 text-sm text-amber-200/90 sm:px-5">{instanceBookBlock}</p>
                ) : inst.slots.length === 0 ? (
                  <p className="px-4 py-5 text-sm leading-relaxed text-white/65 sm:px-5">
                    No time slots are published for this night yet. The venue may still be building the grid — check back
                    soon.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    {inst.slots.map((s) => {
                      const activeBooking = s.booking && !s.booking.cancelledAt ? s.booking : null;
                      const isReservedCandidate = reserve === s.id;
                      const slotStartUtc = slotStartInstant(inst.date, s.startMin, t.timeZone);
                      const eff = effectiveSlotRestriction(s, t);
                      const slotBlockReasonText = slotRestrictionBlockReason(
                        {
                          bookingRestrictionMode: eff.bookingRestrictionMode,
                          restrictionHoursBefore: eff.restrictionHoursBefore,
                          onPremiseMaxDistanceMeters: eff.onPremiseMaxDistanceMeters,
                          lat: venue.lat,
                          lng: venue.lng,
                        },
                        slotStartUtc,
                        now,
                        undefined,
                        {
                          onPremiseMissingLocationShouldBlock: false,
                          restrictionTimeZone: t.timeZone,
                        },
                      );

                      const slotUsable = s.status === "AVAILABLE";
                      const canBook =
                        !instanceCancelled &&
                        slotUsable &&
                        !activeBooking &&
                        !instanceBookBlock &&
                        slotBlockReasonText == null;

                      const canCancelBooking =
                        !!activeBooking &&
                        !!session &&
                        ((session.kind === "musician" &&
                          !!activeBooking.musicianId &&
                          activeBooking.musicianId === session.musicianId) ||
                          (session.kind === "venue" && venueStaffVenueIds.includes(venue.id)));

                      const lineupLabel = publicSlotArtistLabel(s, s.booking).trim();
                      const artistCell = lineupLabel
                        ? lineupLabel
                        : !slotUsable
                          ? s.status === "CANCELLED"
                            ? "Cancelled"
                            : "Unavailable"
                          : canBook
                            ? "Open"
                            : "—";

                      const performLabel = isReservedCandidate ? "Confirm" : "Perform";
                      const loginNext = encodeURIComponent(reserveReturnPath(returnPath, s.id));

                      return (
                        <li key={s.id} className="px-4 py-3 sm:px-5">
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="flex min-w-0 flex-1 items-baseline gap-3 sm:gap-4">
                              <span className="shrink-0 text-lg font-bold tabular-nums text-white sm:text-xl">
                                {minutesToTimeLabel(s.startMin)}
                              </span>
                              <span
                                className={`min-w-0 truncate text-base leading-snug sm:text-lg ${
                                  !lineupLabel && canBook
                                    ? "font-medium text-[rgb(var(--om-neon))]"
                                    : "font-medium text-white/90"
                                }`}
                              >
                                {artistCell}
                              </span>
                            </div>

                            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                              {activeBooking && canCancelBooking ? (
                                <form action={cancelBooking} className="w-full sm:w-auto">
                                    <input type="hidden" name="venueSlug" value={venue.slug} />
                                    <input type="hidden" name="returnPath" value={returnPath} />
                                    <input type="hidden" name="bookingId" value={activeBooking.id} />
                                  <FormSubmitButton
                                    label="Cancel"
                                    pendingLabel="…"
                                    className="h-10 w-full rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7rem]"
                                  />
                                </form>
                              ) : canBook ? (
                                isMusician ? (
                                  <form
                                    id={`reserve-form-${s.id}`}
                                    action={bookSlot}
                                    className="w-full sm:w-auto"
                                  >
                                    <input type="hidden" name="venueSlug" value={venue.slug} />
                                    <input type="hidden" name="returnPath" value={returnPath} />
                                    <input type="hidden" name="slotId" value={s.id} />
                                    {eff.bookingRestrictionMode === "ON_PREMISE" ? (
                                      <>
                                        <input type="hidden" name="clientLat" value="" />
                                        <input type="hidden" name="clientLng" value="" />
                                        <OnPremiseReserveButton
                                          formId={`reserve-form-${s.id}`}
                                          label={performLabel}
                                          className={
                                            isReservedCandidate
                                              ? performCompleteClass
                                              : `${performPrimaryClass} bg-[rgb(var(--om-neon))]`
                                          }
                                        />
                                      </>
                                    ) : (
                                      <FormSubmitButton
                                        label={performLabel}
                                        pendingLabel="…"
                                        className={
                                          isReservedCandidate
                                            ? performCompleteClass
                                            : `${performPrimaryClass} bg-[rgb(var(--om-neon))]`
                                        }
                                      />
                                    )}
                                  </form>
                                ) : (
                                  <Link
                                    href={`/login/musician?next=${loginNext}`}
                                    title="Sign in with your artist account to book this slot"
                                    className={`${performPrimaryClass} bg-[rgb(var(--om-neon))]`}
                                  >
                                    Perform
                                  </Link>
                                )
                              ) : activeBooking ? null : (
                                <span className="max-w-xs text-xs text-white/45">
                                  {instanceCancelled
                                    ? "Closed."
                                    : !slotUsable
                                      ? s.status === "CANCELLED"
                                        ? "Cancelled."
                                        : "Unavailable."
                                      : slotBlockReasonText ?? "Booking closed."}
                                </span>
                              )}
                            </div>
                          </div>
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

      {!embed && !isMusician && !isVenueStaffHere && lineups.length > 0 ? (
        <p className="text-center text-xs leading-relaxed text-white/50">
          New artist?{" "}
          <Link href="/register/musician" className="text-white/75 underline hover:text-white">
            Create a free profile
          </Link>
          , then tap <span className="text-white/70">Perform</span> on an open slot.
        </p>
      ) : null}

      {!embed ? (
        <p className="text-center text-xs text-white/40">
          <Link href="/" className="underline hover:text-white/60">
            MicStage
          </Link>
          {" · "}
          <Link href={`/venues/${venue.slug}`} className="underline hover:text-white/60">
            Full venue page
          </Link>
          {isMusician ? (
            <>
              {" · "}
              <Link href={ARTIST_DASHBOARD_HREF} className="underline hover:text-white/60">
                Artist portal
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-4 text-center text-[11px] text-white/35">
          <a href={canonicalUrl} className="underline hover:text-white/55" target="_blank" rel="noreferrer">
            Open on MicStage
          </a>
        </p>
      )}
    </div>
  );
}
