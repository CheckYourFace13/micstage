import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { isValidPublicSlug, locationDirectorySlug } from "@/lib/locationSlugValidation";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { bookSlot, cancelBooking } from "./actions";
import { venueIdsForVenueSession } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { bookingBlockReason, slotRestrictionBlockReason, slotStartInstant } from "@/lib/venueBookingRules";
import { equipmentProvidedList, performanceFormatLabel } from "@/lib/venueDisplay";
import { effectiveSlotRestriction } from "@/lib/slotBookingEffective";
import OnPremiseReserveButton from "@/components/OnPremiseReserveButton";
import { VenueBookingFlash } from "@/components/VenueBookingFlash";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { safeExternalHref } from "@/lib/externalUrl";
import { relatedLocationsForVenue } from "@/lib/relatedLocations";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ venueSlug: string }> }): Promise<Metadata> {
  const { venueSlug } = await props.params;
  if (!isValidPublicSlug(venueSlug)) notFound();
  const path = `/venues/${venueSlug}`;
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return buildPublicMetadata({
      title: "Open mic venue",
      description: "MicStage public venue pages show schedules and bookings when available.",
      path,
    });
  }
  try {
    const venue = await prisma.venue.findUnique({ where: { slug: venueSlug } });
    if (!venue) {
      return buildPublicMetadata({
        title: "Venue not found",
        description:
          "This MicStage venue page could not be found. Browse open mic venues and artists from the home page.",
        path,
      });
    }
    const place = [venue.city, venue.region].filter(Boolean).join(", ");
    const title = place ? `${venue.name} open mic · ${place}` : `${venue.name} open mic schedule`;
    const description = `Book an open mic slot at ${venue.name}${place ? ` in ${place}` : ""}. View schedules, slots, and who’s playing—on MicStage.`;
    return {
      ...buildPublicMetadata({ title, description, path }),
      title: { absolute: `${title} | MicStage` },
    };
  } catch {
    return buildPublicMetadata({
      title: "Open mic venue",
      description: "MicStage public venue pages show schedules and bookings when available.",
      path,
    });
  }
}

export default async function VenuePublicPage(props: {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ bookError?: string; reserve?: string; booked?: string; cancelled?: string }>;
}) {
  const { venueSlug } = await props.params;
  const { bookError, reserve, booked, cancelled } = await props.searchParams;
  const session = await getSession();
  const now = new Date();

  if (!isValidPublicSlug(venueSlug)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return <PublicDataUnavailable title="Venue page unavailable" />;
  }

  let venue;
  try {
    venue = await prisma.venue.findUnique({
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
  } catch {
    return <PublicDataUnavailable title="Venue page unavailable" />;
  }

  if (!venue) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: venue.name,
    url: absoluteUrl(`/venues/${venue.slug}`),
    address: venue.formattedAddress,
    sameAs: [venue.websiteUrl, venue.facebookUrl, venue.instagramUrl, venue.twitterUrl]
      .filter((v): v is string => Boolean(v)),
    geo:
      venue.lat != null && venue.lng != null
        ? { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng }
        : undefined,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Venues", item: absoluteUrl("/venues") },
      { "@type": "ListItem", position: 2, name: venue.name, item: absoluteUrl(`/venues/${venue.slug}`) },
    ],
  };

  const isMusician = session?.kind === "musician";
  const venueStaffVenueIds =
    session?.kind === "venue" ? await venueIdsForVenueSession(session) : [];
  const isStaffForThisVenue = venueStaffVenueIds.includes(venue.id);
  const gear = equipmentProvidedList(venue);
  const websiteHref = safeExternalHref(venue.websiteUrl);
  const socialLinks = (
    [
      ["Facebook", venue.facebookUrl],
      ["Instagram", venue.instagramUrl],
      ["X/Twitter", venue.twitterUrl],
      ["TikTok", venue.tiktokUrl],
      ["YouTube", venue.youtubeUrl],
      ["SoundCloud", venue.soundcloudUrl],
    ] as const
  )
    .map(([label, url]) => {
      const href = safeExternalHref(url);
      return href ? ([label, href] as [string, string]) : null;
    })
    .filter(Boolean) as [string, string][];
  const nearbyLocations = await relatedLocationsForVenue(venue, 5);
  const templateCount = venue.eventTemplates.length;
  const upcomingInstances = venue.eventTemplates.flatMap((t) =>
    t.instances.filter((i) => !i.isCancelled && i.date >= now),
  );
  const upcomingSlots = upcomingInstances.flatMap((i) => i.slots);
  const openSlotCount = upcomingSlots.filter((s) => s.status === "AVAILABLE" && !s.booking).length;
  const bookedSlotCount = upcomingSlots.filter((s) => Boolean(s.booking && !s.booking.cancelledAt)).length;
  const nextUpcomingDate = upcomingInstances
    .map((i) => i.date)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue</div>
            <h1 className="mt-2 text-3xl font-semibold">{venue.name}</h1>
            <div className="mt-2 text-sm text-white/70">{venue.formattedAddress}</div>
            {venue.city ? (
              <Link
                className="mt-2 inline-block text-xs text-white/60 underline hover:text-white"
                href={`/locations/${locationDirectorySlug(venue.city, venue.region)}/performers`}
              >
                Explore artists in {venue.city}
                {venue.region ? `, ${venue.region}` : ""}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {session?.kind === "venue" && isStaffForThisVenue ? (
              <Link className="text-white/70 hover:text-white" href="/venue">
                Venue portal
              </Link>
            ) : null}
            {isMusician ? (
              <Link className="text-white/70 hover:text-white" href={ARTIST_DASHBOARD_HREF}>
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

        <VenueBookingFlash initialBooked={booked === "1"} initialCancelled={cancelled === "1"} />

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

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Availability at a glance</h2>
          <p className="mt-2 text-sm text-white/75">
            {venue.name} lists {templateCount} public open mic {templateCount === 1 ? "schedule" : "schedules"}
            {venue.city ? ` in ${venue.city}${venue.region ? `, ${venue.region}` : ""}` : ""}.{" "}
            {nextUpcomingDate
              ? `Next listed date: ${nextUpcomingDate.toISOString().slice(0, 10)}.`
              : "New dates appear here as the venue publishes them."}{" "}
            Right now: <span className="text-white/90">{openSlotCount} open</span> and{" "}
            <span className="text-white/90">{bookedSlotCount} booked</span> slots across upcoming nights (counts update live
            with the venue&apos;s calendar).
          </p>
          <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/70">
            <span className="font-medium text-white/85">Performers:</span> book open times in the schedule sections
            below—MicStage confirms instantly when you&apos;re signed in.{" "}
            <span className="text-white/55">Fans can browse who&apos;s on without an account.</span>
          </div>
        </section>

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
          <p className="text-xs text-white/55">
            Performance format is set per schedule block below (each open mic night can differ). Venue-wide details here
            still apply to every visit.
          </p>
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
          {websiteHref ? (
            <div>
              <div className="text-white/60">Website</div>
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-[rgb(var(--om-neon))] underline hover:brightness-110"
              >
                Visit venue site
              </a>
            </div>
          ) : null}
          {socialLinks.length > 0 ? (
            <div>
              <div className="text-white/60">Social media</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {socialLinks.map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
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

        {nearbyLocations.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Related nearby locations</h2>
            <p className="mt-2 text-sm text-white/70">
              Discover performer activity in related markets to compare open mic availability and audience reach.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {nearbyLocations.map((l) => (
                <Link
                  key={l.slug}
                  href={`/locations/${l.slug}/performers`}
                  className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
                >
                  {l.label} ({l.venueCount})
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {venue.eventTemplates.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-6 text-sm text-white/70">
            <p className="font-semibold text-white/85">No public bookable schedule yet</p>
            <p className="mt-2 text-white/65">
              This venue hasn&apos;t published open mic dates on MicStage. Check their website or social links above, or
              visit again soon.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.06)] p-5">
              <h2 className="text-xl font-semibold text-white">Book a performance slot</h2>
              <p className="mt-2 text-sm text-white/70">
                Times below are set by the venue. <span className="text-white/85">Open</span> rows can be reserved when you
                sign in as an artist—booking is free and tied to the live schedule you see here (no separate off-platform
                list).
              </p>
            </section>
            <div className="mt-6 grid gap-6">
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
                    <div className="mt-1 text-sm text-white/65">
                      <span className="text-white/50">Performance format:</span>{" "}
                      <span className="font-medium text-white/90">{performanceFormatLabel(t.performanceFormat)}</span>
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
                            const eff = effectiveSlotRestriction(s, t);
                            const slotBlockReason = slotRestrictionBlockReason(
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
                                    <FormSubmitButton
                                      label="Cancel booking"
                                      pendingLabel="Cancelling…"
                                      className="h-9 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white hover:bg-white/10 disabled:opacity-60"
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
                                      <input type="hidden" name="slotId" value={s.id} />
                                      {eff.bookingRestrictionMode === "ON_PREMISE" ? (
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
                                        <FormSubmitButton
                                          label={
                                            isReservedCandidate ? "Complete reservation" : "Reserve this slot"
                                          }
                                          pendingLabel="Reserving…"
                                          className={`h-9 rounded-md px-3 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-60 ${
                                            isReservedCandidate ? "bg-emerald-400" : "bg-[rgb(var(--om-neon))]"
                                          }`}
                                        />
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
          </>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-3 grid gap-3 text-sm text-white/80">
            <div>
              <h3 className="font-semibold text-white">How do artists reserve a slot here?</h3>
              <p className="mt-1">
                Find an <span className="text-white/90">Open slot</span> in the schedules above, sign in (or create a free
                artist account), and complete the reservation—your spot is confirmed against the same calendar everyone sees
                on this page.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">What schedule details are public?</h3>
              <p className="mt-1">
                Public templates include weekday/time, slot length, upcoming dates, slot status, and booked performer names.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Can fans use this page?</h3>
              <p className="mt-1">
                Yes. Fans can view upcoming open mic dates and performers, then follow venue links for additional details.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Open mic planning guides</h2>
          <p className="mt-2 text-sm text-white/70">
            Looking for practical strategy on improving turnout and repeat participation? These evergreen guides are built
            for venues and performers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/resources/how-to-run-a-successful-open-mic-night"
              className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
            >
              How to run a successful open mic night
            </Link>
            <Link
              href="/resources/why-open-mic-nights-work-for-venues"
              className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
            >
              Why open mic nights work for venues
            </Link>
            <Link
              href="/resources"
              className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
            >
              All resources
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

