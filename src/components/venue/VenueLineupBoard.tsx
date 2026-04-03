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

                      const isOpen = slotUsable && !activeBooking;

                      return (
                        <li key={s.id} className="px-4 py-4 sm:px-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
                                  {minutesToTimeLabel(s.startMin)}
                                </span>
                                <span className="text-lg text-white/40">–</span>
                                <span className="text-xl font-semibold tabular-nums text-white/90 sm:text-2xl">
                                  {minutesToTimeLabel(s.endMin)}
                                </span>
                                {isOpen ? (
                                  <span className="ml-1 inline-flex items-center rounded-full bg-[rgb(var(--om-neon))]/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[rgb(var(--om-neon))]">
                                    Open
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-lg font-medium leading-snug text-white sm:text-xl">
                                {activeBooking ? (
                                  <span>{activeBooking.performerName}</span>
                                ) : !slotUsable ? (
                                  <span className="text-white/45">
                                    {s.status === "CANCELLED" ? "Slot cancelled" : "Unavailable"}
                                  </span>
                                ) : (
                                  <span className="text-white/50">Open slot — be the first to book</span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {activeBooking && canCancelBooking ? (
                                <form action={cancelBooking}>
                                    <input type="hidden" name="venueSlug" value={venue.slug} />
                                    <input type="hidden" name="returnPath" value={returnPath} />
                                    <input type="hidden" name="bookingId" value={activeBooking.id} />
                                  <FormSubmitButton
                                    label="Cancel"
                                    pendingLabel="…"
                                    className="h-11 min-w-[7rem] rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                                  />
                                </form>
                              ) : canBook ? (
                                isMusician ? (
                                  <form
                                    id={`reserve-form-${s.id}`}
                                    action={bookSlot}
                                    className="flex flex-wrap items-center gap-2"
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
                                          label={isReservedCandidate ? "Complete" : "Reserve"}
                                          className={`h-11 min-w-[8rem] rounded-lg px-4 text-sm font-bold text-black ${
                                            isReservedCandidate ? "bg-emerald-400" : "bg-[rgb(var(--om-neon))]"
                                          } hover:brightness-110 disabled:opacity-60`}
                                        />
                                      </>
                                    ) : (
                                      <FormSubmitButton
                                        label={isReservedCandidate ? "Complete" : "Reserve"}
                                        pendingLabel="…"
                                        className={`h-11 min-w-[8rem] rounded-lg px-4 text-sm font-bold text-black disabled:opacity-60 ${
                                          isReservedCandidate ? "bg-emerald-400" : "bg-[rgb(var(--om-neon))]"
                                        } hover:brightness-110`}
                                      />
                                    )}
                                  </form>
                                ) : (
                                  <Link
                                    href={`/login/musician?next=${encodeURIComponent(`${returnPath.includes("?") ? `${returnPath}&` : `${returnPath}?`}reserve=${s.id}`)}`}
                                    className="inline-flex h-11 min-w-[8rem] items-center justify-center rounded-lg border-2 border-[rgba(var(--om-neon),0.55)] bg-[rgba(var(--om-neon),0.15)] px-4 text-sm font-bold text-white hover:bg-[rgba(var(--om-neon),0.25)]"
                                  >
                                    Reserve
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
