import Link from "next/link";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { DiscoveryListingBadge } from "@/components/discovery/DiscoveryListingBadge";
import { EmptyDiscoveryActions } from "@/components/publicListings/EmptyDiscoveryActions";
import {
  assertKnownLocationSlugOrNotFound,
  canonicalLocationSlugOrNull,
  resolveLocationPlaceTitle,
} from "@/lib/locationSlugValidation";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadDiscoveryMarketOpenMics } from "@/lib/publicListings/discoveryMerge";
import type { OpenMicFinderVenue } from "@/lib/publicListings/types";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { relatedLocationsForLocationSlug } from "@/lib/relatedLocations";
import { rollupDiscoveryLabel } from "@/lib/discoveryMarket";
import { shouldIndexDiscoveryPage } from "@/lib/seo/discoveryIndex";
import { jsDayToWeekday } from "@/lib/publicListings/listingSeo";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import type { Weekday } from "@/generated/prisma/client";
import { ShareLinks } from "@/components/publicListings/ShareLinks";

export const dynamic = "force-dynamic";

const WEEKDAY_ORDER: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function startLabelForDay(v: OpenMicFinderVenue, day: Weekday): string | null {
  const starts = (v.scheduleStarts ?? []).filter((s) => s.weekday === day);
  if (starts.length === 0) return null;
  const min = Math.min(...starts.map((s) => s.startTimeMin));
  return minutesToTimeLabel(min);
}

function listingCard(v: OpenMicFinderVenue, day?: Weekday) {
  const start = day ? startLabelForDay(v, day) : null;
  const knownBits = [
    start ? `Starts ${start}` : null,
    v.signupMethod ? `Signup: ${v.signupMethod}` : null,
    v.cost ? `Cost: ${v.cost}` : null,
    v.performanceFormats && v.performanceFormats.length > 0
      ? v.performanceFormats.slice(0, 2).map((f) => performanceFormatLabel(f)).join(" · ")
      : null,
  ].filter(Boolean);
  return (
    <li key={`${v.href}-${v.slug}-${day ?? "all"}`}>
      <Link
        href={v.href}
        className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-[rgb(var(--om-neon))]/40 hover:bg-black/45"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{v.name}</span>
          <DiscoveryListingBadge kind={v.kind} bookable={v.bookable} hasSchedule={v.hasSchedule} />
        </div>
        <p className="mt-1 text-xs text-white/55">{[v.city, v.region].filter(Boolean).join(", ")}</p>
        {knownBits.length > 0 ? <p className="mt-1 text-xs text-white/50">{knownBits.join(" · ")}</p> : null}
        {!day && v.scheduleWeekdays && v.scheduleWeekdays.length > 0 ? (
          <p className="mt-1 text-xs text-white/45">
            {v.scheduleWeekdays.map((d) => weekdayToLabel(d as Weekday)).join(" · ")}
          </p>
        ) : null}
        <span className="mt-2 inline-block text-xs text-[rgb(var(--om-neon))] underline">
          {v.ctaLabel ? v.ctaLabel : v.bookable ? "View schedule and book →" : "View listing →"}
        </span>
      </Link>
    </li>
  );
}

export async function generateMetadata(props: { params: Promise<{ locationSlug: string }> }): Promise<Metadata> {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  const slug = canonical ?? locationSlug;
  const place = await resolveLocationPlaceTitle(slug);
  const prisma = getPrismaOrNull();
  let index = false;
  let listingCount = 0;
  let hasSchedule = false;
  if (prisma) {
    try {
      const listings = await loadDiscoveryMarketOpenMics(prisma, slug);
      listingCount = listings.length;
      hasSchedule = listings.some((l) => l.hasSchedule);
      index = shouldIndexDiscoveryPage({
        venueCount: listingCount,
        listingCount,
        hasPublicSchedule: hasSchedule,
        requireMeaningfulInventory: true,
      });
    } catch {
      index = false;
    }
  }
  return buildPublicMetadata({
    title: hasSchedule
      ? `Open Mics in ${place} Tonight | Music, Comedy & Poetry`
      : `Open Mics in ${place} | Music, Comedy & Poetry`,
    description: hasSchedule
      ? `Find open mics near you in ${place} — tonight and this week for music, comedy, and poetry. See schedules and signup details on MicStage.`
      : `Find open mics near you in ${place} for music, comedy, and poetry. See schedules and signup details on MicStage.`,
    path: `/locations/${slug}/open-mics`,
    index,
  });
}

export default async function LocationOpenMicsPage(props: { params: Promise<{ locationSlug: string }> }) {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  if (canonical && canonical !== locationSlug) {
    permanentRedirect(`/locations/${canonical}/open-mics`);
  }
  await assertKnownLocationSlugOrNotFound(locationSlug);
  const placeTitle = await resolveLocationPlaceTitle(locationSlug);

  const prisma = getPrismaOrNull();
  let listings: Awaited<ReturnType<typeof loadDiscoveryMarketOpenMics>> = [];
  let queryFailed = false;

  try {
    if (prisma) {
      listings = await loadDiscoveryMarketOpenMics(prisma, locationSlug);
    }
  } catch (e) {
    console.error("[location open-mics]", locationSlug, e);
    queryFailed = true;
  }

  const bookable = listings.filter((l) => l.bookable);
  const hubCity = placeTitle.split(",")[0]?.trim().toLowerCase() ?? "";
  const includesOtherCities = listings.some((l) => {
    const c = (l.city ?? "").trim().toLowerCase();
    return c && hubCity && c !== hubCity && !c.includes(hubCity);
  });
  const isMetroHub = Boolean(rollupDiscoveryLabel(locationSlug) || includesOtherCities);
  const nearbyLocations = await relatedLocationsForLocationSlug(locationSlug, 6);

  const todayWeekday = jsDayToWeekday(new Date().getDay());
  const tomorrowWeekday = WEEKDAY_ORDER[(WEEKDAY_ORDER.indexOf(todayWeekday) + 1) % 7]!;
  const tonight = listings.filter((l) => (l.scheduleWeekdays ?? []).includes(todayWeekday));
  const tomorrow = listings.filter((l) => (l.scheduleWeekdays ?? []).includes(tomorrowWeekday));
  const tonightLabel = weekdayToLabel(todayWeekday);
  const tomorrowLabel = weekdayToLabel(tomorrowWeekday);
  const scheduledCount = listings.filter((l) => l.hasSchedule).length;
  const showCalendar = scheduledCount >= 1;
  const thisWeekByDay = WEEKDAY_ORDER.map((day) => ({
    day,
    label: weekdayToLabel(day),
    rows: listings.filter((l) => (l.scheduleWeekdays ?? []).includes(day)),
  })).filter((g) => g.rows.length > 0);

  const comedy = listings.filter((l) =>
    (l.performanceFormats ?? []).some((f) => f === "COMEDY" || f === "COMEDY_SPOKEN_WORD"),
  );
  const spoken = listings.filter((l) => (l.performanceFormats ?? []).includes("SPOKEN_WORD"));
  const music = listings.filter((l) =>
    (l.performanceFormats ?? []).some((f) =>
      ["ACOUSTIC_ONLY", "GUITAR_VOCAL_ONLY", "FULL_BANDS_ALLOWED", "OPEN_VARIETY"].includes(f),
    ),
  );

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Find open mics", item: absoluteUrl("/find-open-mics") },
      { "@type": "ListItem", position: 2, name: "Markets", item: absoluteUrl("/locations") },
      {
        "@type": "ListItem",
        position: 3,
        name: `Open mics in ${placeTitle}`,
        item: absoluteUrl(`/locations/${locationSlug}/open-mics`),
      },
    ],
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Open mics</div>
            <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Open Mics in {placeTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Trusted open-mic listings in {placeTitle}. Verified rooms appear even when the exact time still needs
              confirmation. Scheduled nights get the calendar sections below.
            </p>
            {isMetroHub ? (
              <p className="mt-2 max-w-2xl text-xs text-white/55">
                This is a metro hub, not a single city boundary. Nearby suburbs may appear here; each card shows that
                room&apos;s own city and state.
              </p>
            ) : null}
            <div className="mt-3">
              <ShareLinks
                url={absoluteUrl(`/locations/${locationSlug}/open-mics`)}
                title={`Open mics in ${placeTitle}`}
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm">
            <Link className="text-white/70 hover:text-white" href="/find-open-mics">
              Search near you
            </Link>
            <Link className="text-white/70 hover:text-white" href="/locations">
              All markets
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
            {listings.length} listing{listings.length === 1 ? "" : "s"}
          </span>
          {bookable.length > 0 ? (
            <span className="rounded-md border border-[rgb(var(--om-neon))]/30 bg-[rgba(var(--om-neon),0.08)] px-2 py-1">
              {bookable.length} with online signups open
            </span>
          ) : null}
          <Link
            href={`/locations/${locationSlug}/performers`}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 underline hover:text-white"
          >
            See upcoming artists in {placeTitle}
          </Link>
        </div>

        {queryFailed ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90">
            We could not load listings for this market. Try again shortly.
          </div>
        ) : listings.length === 0 ? (
          <div className="mt-6">
            <EmptyDiscoveryActions context={`market ${locationSlug} empty`} />
          </div>
        ) : (
          <div className="mt-8 grid gap-8">
            {showCalendar && tonight.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Tonight</h2>
                <p className="mt-1 text-xs text-white/55">
                  Recurring {tonightLabel} schedules on file — confirm with the venue before you go.
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {tonight.map((v) => listingCard(v, todayWeekday))}
                </ul>
              </section>
            ) : null}

            {showCalendar && tomorrow.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Tomorrow</h2>
                <p className="mt-1 text-xs text-white/55">
                  Recurring {tomorrowLabel} schedules on file — confirm with the venue before you go.
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {tomorrow.map((v) => listingCard(v, tomorrowWeekday))}
                </ul>
              </section>
            ) : null}

            {showCalendar && thisWeekByDay.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">This week</h2>
                <p className="mt-1 text-xs text-white/55">
                  From published weekly schedules — confirm with the venue before you go.
                </p>
                <div className="mt-3 grid gap-3">
                  {thisWeekByDay.map((g) => (
                    <div key={g.day}>
                      <h3 className="text-sm font-medium text-white/80">{g.label}</h3>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {g.rows.map((v) => listingCard(v, g.day))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : tonight.length === 0 && !showCalendar ? (
              <p className="text-sm text-white/50">
                No recurring {tonightLabel} schedules are on file for {placeTitle} right now. Browse the full list
                below, or{" "}
                <Link href="/find-open-mics" className="underline hover:text-white">
                  search near you
                </Link>
                .
              </p>
            ) : null}

            <section>
              <h2 className="text-lg font-semibold">Open mics in {placeTitle}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">{listings.map((v) => listingCard(v))}</ul>
            </section>

            {bookable.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Signups open on MicStage</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{bookable.map((v) => listingCard(v))}</ul>
              </section>
            ) : null}

            {comedy.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Comedy open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{comedy.map((v) => listingCard(v))}</ul>
              </section>
            ) : null}

            {music.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Music open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{music.map((v) => listingCard(v))}</ul>
              </section>
            ) : null}

            {spoken.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Poetry &amp; spoken word open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{spoken.map((v) => listingCard(v))}</ul>
              </section>
            ) : null}
          </div>
        )}

        {nearbyLocations.length > 0 ? (
          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="text-sm font-semibold text-white/80">Nearby markets</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {nearbyLocations.map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}/open-mics`}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  {loc.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="mt-10 text-center text-sm text-white/50">
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
            Find open mics near you
          </Link>
          {" · "}
          <Link href="/resources" className="underline hover:text-white">
            Open mic guides
          </Link>
          {" · "}
          <Link href="/map" className="underline hover:text-white">
            Open mic map
          </Link>
        </p>
      </main>
    </div>
  );
}
