import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { bookSlot, cancelBooking } from "./actions";
import { venueIdsForVenueSession } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { bookingBlockReason, slotRestrictionBlockReason, slotStartInstant } from "@/lib/venueBookingRules";
import { equipmentProvidedList, performanceFormatLabel } from "@/lib/venueDisplay";
import OnPremiseReserveButton from "@/components/OnPremiseReserveButton";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ venueSlug: string }> }) {
  const { venueSlug } = await props.params;
  const venue = await prisma.venue.findUnique({ where: { slug: venueSlug } });
  const canonical = `https://micstage.com/venues/${venueSlug}`;
  if (!venue)
    return {
      title: "Venue not found | MicStage",
      alternates: { canonical },
    };
  return {
    title: `${venue.name} open mic schedule | ${venue.city ?? ""}`.trim(),
    description: `Book an open mic slot at ${venue.name}. View who’s playing and when.`,
    alternates: { canonical },
  };
}

export default async function VenuePublicPage(props: {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ bookError?: string; reserve?: string }>;
}) {
  const { venueSlug } = await props.params;
  const { bookError, reserve } = await props.searchParams;
  const session = await getSession();
  const now = new Date();

  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    include: {
      eventTemplates: {
        where: { isPublic: true },
        orderBy: [{ weekday: "asc" }, { startTimeMin: "asc" }],
        include: {
          instances: {
            orderBy: { date: "desc" },
            take: 8,
            include: { slots: { orderBy: { startMin: "asc" }, include: { booking: true } } },
          },
        },
      },
    },
  });

  if (!venue) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: venue.name,
    address: venue.formattedAddress,
    geo:
      venue.lat != null && venue.lng != null
        ? { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng }
        : undefined,
  };

  const isMusician = session?.kind === "musician";
  const venueStaffVenueIds =
    session?.kind === "venue" ? await venueIdsForVenueSession(session) : [];
  const gear = equipmentProvidedList(venue);
  const socialLinks = [
    ["Facebook", venue.facebookUrl],
    ["Instagram", venue.instagramUrl],
    ["X/Twitter", venue.twitterUrl],
    ["TikTok", venue.tiktokUrl],
    ["YouTube", venue.youtubeUrl],
    ["SoundCloud", venue.soundcloudUrl],
  ].filter(([, url]) => Boolean(url)) as [string, string][];

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue</div>
            <h1 className="mt-2 text-3xl font-semibold">{venue.name}</h1>
            <div className="mt-2 text-sm text-white/70">{venue.formattedAddress}</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {isMusician ? (
              <Link className="text-white/70 hover:text-white" href="/artist">
                Artist portal
              </Link>
            ) : (
              <Link className="text-white/70 hover:text-white" href="/login/musician">
                Artist login
              </Link>
            )}
            <Link className="text-white/70 hover:text-white" href="/">
              Home
            </Link>
          </div>
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        {bookError ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            {bookError}
          </div>
        ) : null}
        {isMusician && reserve ? (
          <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Continue your reservation by clicking <span className="font-semibold">Complete reservation</span> on the selected slot.
          </div>
        ) : null}

        {venue.about ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/80">
            {venue.about}
          </div>
        ) : null}

        {(venue.logoUrl || venue.imagePrimaryUrl || venue.imageSecondaryUrl) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {venue.logoUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-2 text-xs text-white/60">Logo</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={venue.logoUrl} alt={`${venue.name} logo`} className="max-h-40 w-auto max-w-full" />
              </div>
            ) : null}
            {venue.imagePrimaryUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-2 text-xs text-white/60">Image 1</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={venue.imagePrimaryUrl} alt={`${venue.name} image 1`} className="max-h-56 w-auto max-w-full" />
              </div>
            ) : null}
            {venue.imageSecondaryUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-2 text-xs text-white/60">Image 2</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={venue.imageSecondaryUrl} alt={`${venue.name} image 2`} className="max-h-56 w-auto max-w-full" />
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/80">
          <div>
            <span className="text-white/60">Performance format: </span>
            <span className="font-medium text-white">{performanceFormatLabel(venue.performanceFormat)}</span>
          </div>
          {gear.length > 0 ? (
            <div>
              <div className="text-white/60">Provided for artists</div>
              <ul className="mt-1 list-inside list-disc text-white/90">
                {gear.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-white/50">Equipment details not listed yet — check with the venue.</div>
          )}
          {socialLinks.length > 0 ? (
            <div>
              <div className="text-white/60">Social media</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {socialLinks.map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/90 hover:bg-black/40"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <div className="text-xs text-white/50">
            {venue.seriesStartDate || venue.seriesEndDate ? (
              <>
                Open mic series:{" "}
                {venue.seriesStartDate ? venue.seriesStartDate.toISOString().slice(0, 10) : "—"} →{" "}
                {venue.seriesEndDate ? venue.seriesEndDate.toISOString().slice(0, 10) : "—"}
                <br />
              </>
            ) : null}
            Bookings open up to <span className="font-mono text-white/80">{venue.bookingOpensDaysAhead}</span> days in advance.
          </div>
        </div>

        {venue.eventTemplates.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            No public schedules yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-6">
            {venue.eventTemplates.map((t) => (
              <section key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{t.title}</h2>
                    <div className="mt-1 text-sm text-white/70">
                      {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–{minutesToTimeLabel(t.endTimeMin)} ·{" "}
                      {t.slotMinutes}m slots
                      {t.breakMinutes ? ` + ${t.breakMinutes}m breaks` : ""}
                    </div>
                  </div>
                </div>

                {t.instances.length === 0 ? (
                  <div className="mt-4 text-sm text-white/60">No date schedules generated yet.</div>
                ) : (
                  <div className="mt-5 grid gap-5">
                    {t.instances.map((inst) => {
                      const instanceBookBlock = bookingBlockReason(venue, inst.date);
                      const instanceCancelled = inst.isCancelled;
                      return (
                      <div key={inst.id} className="rounded-xl border border-white/10 bg-black/30 p-5">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="font-semibold">Schedule for {inst.date.toISOString().slice(0, 10)}</div>
                          <div className="text-xs text-white/50">{inst.slots.length} slots</div>
                        </div>
                        {instanceCancelled ? (
                          <div className="mt-2 text-xs text-amber-200/90">This date was cancelled — booking is closed.</div>
                        ) : null}
                        {instanceBookBlock ? (
                          <div className="mt-2 text-xs text-amber-200/90">{instanceBookBlock}</div>
                        ) : null}

                        <div className="mt-3 grid gap-2">
                          {inst.slots.map((s) => {
                            const activeBooking = s.booking && !s.booking.cancelledAt ? s.booking : null;
                            const isReservedCandidate = reserve === s.id;
                            const slotStartUtc = slotStartInstant(inst.date, s.startMin, t.timeZone);
                            const slotBlockReason = slotRestrictionBlockReason(
                              {
                                bookingRestrictionMode: t.bookingRestrictionMode,
                                restrictionHoursBefore: t.restrictionHoursBefore,
                                onPremiseMaxDistanceMeters: t.onPremiseMaxDistanceMeters,
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
                              slotBlockReason == null;

                            const canCancelBooking =
                              !!activeBooking &&
                              !!session &&
                              ((session.kind === "musician" &&
                                !!activeBooking.musicianId &&
                                activeBooking.musicianId === session.musicianId) ||
                                (session.kind === "venue" && venueStaffVenueIds.includes(venue.id)));
                            return (
                              <div
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                              >
                                <div className="text-sm">
                                  <span className="font-semibold">
                                    {minutesToTimeLabel(s.startMin)}–{minutesToTimeLabel(s.endMin)}
                                  </span>
                                  <span className="ml-2 text-white/70">
                                    {activeBooking
                                      ? `Booked: ${activeBooking.performerName}`
                                      : !slotUsable
                                        ? s.status === "CANCELLED"
                                          ? "Cancelled slot"
                                          : "Unavailable"
                                        : "Open slot"}
                                  </span>
                                </div>

                                {activeBooking && canCancelBooking ? (
                                  <form action={cancelBooking}>
                                    <input type="hidden" name="venueSlug" value={venue.slug} />
                                    <input type="hidden" name="bookingId" value={activeBooking.id} />
                                    <button className="h-9 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white hover:bg-white/10">
                                      Cancel
                                    </button>
                                  </form>
                                ) : canBook ? (
                                  isMusician ? (
                                    <form
                                      id={`reserve-form-${s.id}`}
                                      action={bookSlot}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <input type="hidden" name="venueSlug" value={venue.slug} />
                                      <input type="hidden" name="slotId" value={s.id} />
                                      {t.bookingRestrictionMode === "ON_PREMISE" ? (
                                        <>
                                          <input type="hidden" name="clientLat" value="" />
                                          <input type="hidden" name="clientLng" value="" />
                                          <OnPremiseReserveButton
                                            formId={`reserve-form-${s.id}`}
                                            label={
                                              isReservedCandidate
                                                ? "Complete reservation"
                                                : "Reserve near you"
                                              }
                                            className={`h-9 rounded-md px-3 text-sm font-semibold text-black hover:brightness-110 ${
                                              isReservedCandidate ? "bg-emerald-400" : "bg-[rgb(var(--om-neon))]"
                                            } disabled:opacity-60`}
                                          />
                                        </>
                                      ) : (
                                        <button
                                          type="submit"
                                          className={`h-9 rounded-md px-3 text-sm font-semibold text-black hover:brightness-110 ${
                                            isReservedCandidate ? "bg-emerald-400" : "bg-[rgb(var(--om-neon))]"
                                          }`}
                                        >
                                          {isReservedCandidate ? "Complete reservation" : "Reserve this slot"}
                                        </button>
                                      )}
                                    </form>
                                  ) : (
                                    <Link
                                      href={`/login/musician?next=${encodeURIComponent(`/venues/${venue.slug}?reserve=${s.id}`)}`}
                                      className="h-9 rounded-md border border-[rgba(var(--om-neon),0.55)] bg-[rgba(var(--om-neon),0.12)] px-3 py-2 text-xs font-semibold text-white hover:bg-[rgba(var(--om-neon),0.18)]"
                                    >
                                      Click here to reserve
                                    </Link>
                                  )
                                ) : activeBooking ? null : (
                                  <span className="text-xs text-white/45">
                                    {instanceCancelled
                                      ? "Booking closed."
                                      : !slotUsable
                                        ? s.status === "CANCELLED"
                                          ? "This slot was cancelled."
                                          : "This slot is not available."
                                        : slotBlockReason ?? "Booking closed for this date."}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

