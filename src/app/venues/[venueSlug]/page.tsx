import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { isValidPublicSlug, locationDirectorySlug } from "@/lib/locationSlugValidation";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { venueIdsForVenueSession } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { equipmentProvidedList } from "@/lib/venueDisplay";
import { VenueBookingFlash } from "@/components/VenueBookingFlash";
import { VenueLineupBoard } from "@/components/venue/VenueLineupBoard";
import { loadPublicVenueForLineup } from "@/lib/venuePublicLineupData";
import {
  lineupsForStorageYmd,
  pickPrimaryLineup,
  storageYmdUtc,
  upcomingLineupDateYmds,
} from "@/lib/venuePublicLineup";
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
    venue = await loadPublicVenueForLineup(venueSlug);
  } catch (e) {
    console.error("[public venue] loadPublicVenueForLineup failed", venueSlug, e);
    return (
      <PublicDataUnavailable
        title="This venue page couldn’t load"
        description="The live schedule query failed. If you just deployed, apply pending Prisma migrations (slot override columns) and run prisma generate, then redeploy."
      />
    );
  }

  if (!venue) notFound();

  const primary = pickPrimaryLineup(venue.eventTemplates, venue.timeZone, now);
  const lineupDates = upcomingLineupDateYmds(venue.eventTemplates, venue.timeZone, now, 28);
  const heroYmd = primary
    ? storageYmdUtc(primary.instance.date)
    : lineupDates[0] ?? null;
  const heroLineups = heroYmd ? lineupsForStorageYmd(venue.eventTemplates, heroYmd) : [];
  const venueHomeReturnPath = reserve
    ? `/venues/${venue.slug}?reserve=${encodeURIComponent(reserve)}`
    : `/venues/${venue.slug}`;

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
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:max-w-5xl sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-8">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/55">Open mic</div>
            <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{venue.name}</h1>
            <div className="mt-2 text-sm text-white/70">{venue.formattedAddress}</div>
            {heroYmd ? (
              <p className="mt-3 text-sm text-white/60">
                <Link
                  className="font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110"
                  href={`/venues/${venue.slug}/lineup/${heroYmd}`}
                >
                  Lineup for {lineupNavLabelFromYmd(heroYmd)} →
                </Link>{" "}
                <span className="text-white/45">(share this link)</span>
              </p>
            ) : null}
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
            Continue your reservation by tapping <span className="font-semibold">Reserve</span> on the selected slot below.
          </div>
        ) : null}

        {venue.eventTemplates.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-6 text-sm text-white/70">
            <p className="font-semibold text-white/85">No public bookable schedule yet</p>
            <p className="mt-2 text-white/65">
              This venue hasn&apos;t published open mic dates on MicStage. Check back soon or open the venue&apos;s site or socials
              under <span className="text-white/80">Venue details</span> below.
            </p>
          </div>
        ) : (
          <section className="mt-6" aria-label="Open mic lineup">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Lineup</h2>
              {heroYmd ? (
                <Link
                  className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                  href={`/venues/${venue.slug}/lineup/${heroYmd}`}
                >
                  Full-screen lineup
                </Link>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-white/60">
              Set times and who&apos;s on — <span className="text-white/80">Open</span> means bookable for artists (sign in to
              reserve).
            </p>

            {heroYmd ? (
              <>
                {lineupDates.length > 1 ? (
                  <nav className="mt-5" aria-label="Upcoming open mic dates">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">More nights</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lineupDates.map((ymd) => (
                        <Link
                          key={ymd}
                          href={`/venues/${venue.slug}/lineup/${ymd}`}
                          className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                            ymd === heroYmd
                              ? "border-[rgb(var(--om-neon))] bg-[rgb(var(--om-neon))]/15 text-white"
                              : "border-white/15 bg-black/30 text-white/85 hover:border-white/25 hover:bg-black/45"
                          }`}
                        >
                          {lineupNavLabelFromYmd(ymd)}
                        </Link>
                      ))}
                    </div>
                  </nav>
                ) : null}

                <div className="mt-6">
                  <VenueLineupBoard
                    venue={venue}
                    lineups={heroLineups}
                    ymd={heroYmd}
                    now={now}
                    session={session}
                    venueStaffVenueIds={venueStaffVenueIds}
                    isMusician={isMusician}
                    returnPath={venueHomeReturnPath}
                    reserve={reserve}
                    heroBadge={
                      primary && heroYmd && storageYmdUtc(primary.instance.date) === heroYmd ? primary.badge : null
                    }
                    showShareStrip
                  />
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-black/25 p-6 text-sm text-white/70">
                <p className="font-medium text-white/85">No upcoming nights in the booking window</p>
                <p className="mt-2 text-white/65">
                  Dates may be outside the published range, or the venue is still adding nights. Try the{" "}
                  <Link className="text-[rgb(var(--om-neon))] underline" href={`/venues/${venue.slug}/lineup`}>
                    lineup redirect
                  </Link>{" "}
                  or check back later.
                </p>
              </div>
            )}
          </section>
        )}

        <details className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:bg-white/[0.05] sm:p-6">
          <summary className="cursor-pointer list-none text-lg font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-white/20 underline-offset-4">Venue details</span>
            <span className="mt-1 block text-sm font-normal text-white/50">
              About, availability summary, photos, gear, website & socials
            </span>
          </summary>
          <div className="mt-6 space-y-6 border-t border-white/10 pt-6">
            {venue.about ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/80">
                {venue.about}
              </div>
            ) : null}

            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-lg font-semibold text-white">Availability at a glance</h3>
              <p className="mt-2 text-sm text-white/75">
                {venue.name} lists {templateCount} public open mic {templateCount === 1 ? "schedule" : "schedules"}
                {venue.city ? ` in ${venue.city}${venue.region ? `, ${venue.region}` : ""}` : ""}.{" "}
                {nextUpcomingDate
                  ? `Next listed date: ${nextUpcomingDate.toISOString().slice(0, 10)}.`
                  : "New dates appear as the venue publishes them."}{" "}
                Right now: <span className="text-white/90">{openSlotCount} open</span> and{" "}
                <span className="text-white/90">{bookedSlotCount} booked</span> slots across upcoming nights in this window.
              </p>
              <p className="mt-3 text-sm text-white/60">
                Fans don&apos;t need an account. Artists book from the lineup above or the{" "}
                <Link className="text-[rgb(var(--om-neon))] underline" href={`/venues/${venue.slug}/lineup`}>
                  shareable lineup page
                </Link>
                .
              </p>
            </section>

            {(venue.logoUrl || venue.imagePrimaryUrl || venue.imageSecondaryUrl) && (
              <div className="grid gap-3 sm:grid-cols-3">
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

            <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/80">
              <p className="text-xs text-white/55">Format per night matches each schedule block on the lineup.</p>
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
                <div className="text-white/50">Equipment details not listed — check with the venue.</div>
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
                Bookings open up to <span className="font-mono text-white/80">{venue.bookingOpensDaysAhead}</span> days in
                advance.
              </div>
            </div>

            {nearbyLocations.length > 0 ? (
              <section className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-lg font-semibold text-white">Related nearby locations</h3>
                <p className="mt-2 text-sm text-white/70">More performer activity in nearby markets.</p>
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
          </div>
        </details>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-3 grid gap-3 text-sm text-white/80">
            <div>
              <h3 className="font-semibold text-white">How do artists reserve a slot here?</h3>
              <p className="mt-1">
                Find an <span className="text-white/90">Open</span> row in the lineup, sign in (or create a free artist
                account), and complete the reservation—your spot is confirmed against the same board everyone sees here and
                on the shareable lineup link.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">What schedule details are public?</h3>
              <p className="mt-1">
                Each night shows set times, slot status, booked performer names, and open slots. Venues can embed the lineup
                or share the date-specific URL.
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

