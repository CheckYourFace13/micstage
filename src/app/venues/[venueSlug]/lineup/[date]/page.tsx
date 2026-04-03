import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenueLineupBoard } from "@/components/venue/VenueLineupBoard";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { VenueBookingFlash } from "@/components/VenueBookingFlash";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";
import { getSession } from "@/lib/session";
import { venueIdsForVenueSession } from "@/lib/authz";
import { buildLineupPageMetadata } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { loadPublicVenueForLineup } from "@/lib/venuePublicLineupData";
import {
  isValidLineupYmd,
  lineupsForStorageYmd,
  pickPrimaryLineup,
  storageYmdUtc,
  upcomingLineupDateYmds,
} from "@/lib/venuePublicLineup";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ venueSlug: string; date: string }>;
}): Promise<Metadata> {
  const { venueSlug, date } = await props.params;
  if (!isValidPublicSlug(venueSlug) || !isValidLineupYmd(date)) {
    return { title: "Lineup" };
  }
  let venue;
  try {
    venue = await loadPublicVenueForLineup(venueSlug);
  } catch {
    return { title: "Lineup" };
  }
  if (!venue) {
    return { title: "Lineup" };
  }
  const place = [venue.city, venue.region].filter(Boolean).join(", ");
  return buildLineupPageMetadata({
    venueName: venue.name,
    venueSlug: venue.slug,
    ymd: date,
    place,
  });
}

export default async function VenueLineupDatePage(props: {
  params: Promise<{ venueSlug: string; date: string }>;
  searchParams: Promise<{ bookError?: string; reserve?: string; booked?: string; cancelled?: string; embed?: string }>;
}) {
  const { venueSlug, date: dateParam } = await props.params;
  const { bookError, reserve, booked, cancelled, embed } = await props.searchParams;
  const embedMode = embed === "1";

  if (!isValidPublicSlug(venueSlug) || !isValidLineupYmd(dateParam)) notFound();

  const session = await getSession();
  const now = new Date();
  const isMusician = session?.kind === "musician";
  const venueStaffVenueIds =
    session?.kind === "venue" ? await venueIdsForVenueSession(session) : [];

  let venue;
  try {
    venue = await loadPublicVenueForLineup(venueSlug);
  } catch (e) {
    console.error("[public lineup date] load failed", venueSlug, e);
    return (
      <PublicDataUnavailable
        title="Lineup couldn’t load"
        description="Apply database migrations and regenerate Prisma client if you recently deployed slot changes."
      />
    );
  }
  if (!venue) {
    return <PublicDataUnavailable title="Lineup unavailable" />;
  }

  const lineups = lineupsForStorageYmd(venue.eventTemplates, dateParam);
  const primary = pickPrimaryLineup(venue.eventTemplates, venue.timeZone, now);
  const heroBadge =
    primary && storageYmdUtc(primary.instance.date) === dateParam ? primary.badge : null;

  const upcomingDates = upcomingLineupDateYmds(venue.eventTemplates, venue.timeZone, now, 28);
  const returnPath =
    embedMode
      ? `/venues/${venue.slug}/lineup/${dateParam}?embed=1${reserve ? `&reserve=${encodeURIComponent(reserve)}` : ""}`
      : reserve
        ? `/venues/${venue.slug}/lineup/${dateParam}?reserve=${encodeURIComponent(reserve)}`
        : `/venues/${venue.slug}/lineup/${dateParam}`;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main
        className={
          embedMode
            ? "mx-auto w-full max-w-3xl px-4 py-5"
            : "mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-12"
        }
      >
        {!embedMode ? (
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-white/55">Open mic lineup</div>
              <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{venue.name}</h1>
              <p className="mt-2 text-base text-white/70">{venue.formattedAddress}</p>
              <p className="mt-1 text-lg font-semibold text-white/90">{lineupNavLabelFromYmd(dateParam)}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 font-semibold text-white hover:bg-white/15"
                href={`/venues/${venue.slug}`}
              >
                Venue profile
              </Link>
              <Link className="rounded-lg px-4 py-2.5 font-semibold text-white/70 underline hover:text-white" href="/">
                Home
              </Link>
            </div>
          </div>
        ) : (
          <div className="mb-5 border-b border-white/10 pb-4">
            <div className="text-xs font-medium uppercase tracking-widest text-white/50">Lineup</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{venue.name}</h1>
            <p className="mt-1 text-sm text-white/65">{lineupNavLabelFromYmd(dateParam)}</p>
          </div>
        )}

        <VenueBookingFlash initialBooked={booked === "1"} initialCancelled={cancelled === "1"} />

        {bookError ? (
          <div className="mb-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            {bookError}
          </div>
        ) : null}
        {isMusician && reserve ? (
          <div className="mb-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Tap <span className="font-semibold">Reserve</span> on your slot to finish booking.
          </div>
        ) : null}

        {upcomingDates.length > 0 && !embedMode ? (
          <nav className="mb-8" aria-label="Upcoming open mic dates">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/50">More dates</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {upcomingDates.map((ymd) => (
                <Link
                  key={ymd}
                  href={`/venues/${venue.slug}/lineup/${ymd}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    ymd === dateParam
                      ? "border-[rgb(var(--om-neon))] bg-[rgb(var(--om-neon))]/15 text-white"
                      : "border-white/15 bg-white/5 text-white/85 hover:border-white/25 hover:bg-white/10"
                  }`}
                >
                  {lineupNavLabelFromYmd(ymd)}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}

        <VenueLineupBoard
          venue={venue}
          lineups={lineups}
          ymd={dateParam}
          now={now}
          session={session}
          venueStaffVenueIds={venueStaffVenueIds}
          isMusician={isMusician}
          returnPath={returnPath}
          reserve={reserve}
          embed={embedMode}
          heroBadge={heroBadge}
          showShareStrip={!embedMode}
        />
      </main>
    </div>
  );
}
