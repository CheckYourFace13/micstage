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
import { LineupShareStrip } from "@/components/venue/LineupShareStrip";
import {
  lineupPrimaryActionClass,
  lineupPrimaryConfirmClass,
  lineupSecondaryActionClass,
} from "@/components/venue/lineupActionStyles";

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
  /** Show share actions (hidden in embed mode) */
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
  const isVenueStaffHere = session?.kind === "venue" && venueStaffVenueIds.includes(venue.id);

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
        <LineupShareStrip
          lineupUrl={canonicalUrl}
          embedUrl={embedUrl}
          apiUrl={apiUrl}
          publicVenuePath={`/venues/${venue.slug}`}
        />
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
                  {t.description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{t.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-white/65">
                    {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–{minutesToTimeLabel(t.endTimeMin)} ·{" "}
                    {t.slotMinutes} min slots
                    {t.breakMinutes ? ` · ${t.breakMinutes} min breaks` : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/50">{performanceFormatLabel(t.performanceFormat)}</p>
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
                  <ul className="border-t border-white/5">
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

                      let middleCell: string;
                      if (activeBooking && lineupLabel) {
                        middleCell = lineupLabel;
                      } else if (!slotUsable) {
                        middleCell = s.status === "CANCELLED" ? "Cancelled" : "Unavailable";
                      } else {
                        middleCell = "Open";
                      }

                      const performLabel = isReservedCandidate ? "Confirm" : "Perform";
                      const loginNext = encodeURIComponent(reserveReturnPath(returnPath, s.id));

                      const rightCell =
                        activeBooking && canCancelBooking ? (
                          <form action={cancelBooking} className="w-full sm:flex sm:justify-end">
                            <input type="hidden" name="venueSlug" value={venue.slug} />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <input type="hidden" name="bookingId" value={activeBooking.id} />
                            <FormSubmitButton
                              label="Cancel"
                              pendingLabel="…"
                              className={lineupSecondaryActionClass}
                            />
                          </form>
                        ) : canBook ? (
                          isMusician ? (
                            <form
                              id={`reserve-form-${s.id}`}
                              action={bookSlot}
                              className="w-full sm:flex sm:justify-end"
                              data-track-event="booking_started"
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
                                      isReservedCandidate ? lineupPrimaryConfirmClass : lineupPrimaryActionClass
                                    }
                                  />
                                </>
                              ) : (
                                <FormSubmitButton
                                  label={performLabel}
                                  pendingLabel="…"
                                  className={
                                    isReservedCandidate ? lineupPrimaryConfirmClass : lineupPrimaryActionClass
                                  }
                                />
                              )}
                            </form>
                          ) : (
                            <div className="flex justify-end">
                              <Link
                                href={`/login/musician?next=${loginNext}`}
                                title="Sign in with your artist account to book this slot"
                                className={lineupPrimaryActionClass}
                                data-track-event="booking_started"
                              >
                                Perform
                              </Link>
                            </div>
                          )
                        ) : activeBooking ? (
                          <p className="text-right text-sm text-white/45">Booked</p>
                        ) : (
                          <p className="text-right text-sm leading-snug text-white/60">
                            {instanceCancelled
                              ? "Closed"
                              : !slotUsable
                                ? s.status === "CANCELLED"
                                  ? "Cancelled"
                                  : "Unavailable"
                                : slotBlockReasonText ?? "Booking unavailable"}
                          </p>
                        );

                      return (
                        <li key={s.id} className="border-b border-white/10 last:border-b-0">
                          <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[minmax(4.5rem,5.5rem)_minmax(0,1fr)_minmax(10rem,14rem)] sm:items-center sm:gap-4 sm:px-5">
                            <div className="text-base font-bold tabular-nums text-white sm:text-lg">
                              {minutesToTimeLabel(s.startMin)}
                            </div>
                            <div
                              className={`min-w-0 text-base leading-snug sm:text-lg ${
                                middleCell === "Open" && !activeBooking
                                  ? "font-semibold text-[rgb(var(--om-neon))]"
                                  : "font-medium text-white/90"
                              }`}
                            >
                              {middleCell}
                            </div>
                            <div className="min-w-0 sm:flex sm:justify-end">{rightCell}</div>
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
        <footer className="border-t border-white/10 pt-4 text-center">
          <p className="text-[11px] text-white/45">
            <span className="text-white/55">Provided by MicStage</span>
            {" · "}
            <Link href="/" className="underline hover:text-white/75">
              micstage.com
            </Link>
            {" · "}
            <Link href={`/venues/${venue.slug}`} className="underline hover:text-white/75">
              Full venue page
            </Link>
            {isMusician ? (
              <>
                {" · "}
                <Link href={ARTIST_DASHBOARD_HREF} className="underline hover:text-white/75">
                  Artist portal
                </Link>
              </>
            ) : null}
          </p>
        </footer>
      ) : (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-white/40">
          <span className="text-white/45">Provided by MicStage</span>
          {" · "}
          <a href={canonicalUrl} className="underline hover:text-white/60" target="_blank" rel="noreferrer">
            Open full lineup
          </a>
        </p>
      )}
    </div>
  );
}
