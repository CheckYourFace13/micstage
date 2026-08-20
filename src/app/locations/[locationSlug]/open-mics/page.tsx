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
import { shouldIndexDiscoveryPage } from "@/lib/seo/discoveryIndex";
import { jsDayToWeekday } from "@/lib/publicListings/listingSeo";
import { weekdayToLabel } from "@/lib/time";
import type { Weekday } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const WEEKDAY_ORDER: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function listingCard(v: OpenMicFinderVenue) {
  return (
    <li key={`${v.href}-${v.slug}`}>
      <Link
        href={v.href}
        className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-[rgb(var(--om-neon))]/40 hover:bg-black/45"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{v.name}</span>
          <DiscoveryListingBadge kind={v.kind} bookable={v.bookable} hasSchedule={v.hasSchedule} />
        </div>
        <p className="mt-1 text-xs text-white/55">{[v.city, v.region].filter(Boolean).join(", ")}</p>
        {v.scheduleWeekdays && v.scheduleWeekdays.length > 0 ? (
          <p className="mt-1 text-xs text-white/50">
            {v.scheduleWeekdays.map((d) => weekdayToLabel(d as Weekday)).join(" · ")}
          </p>
        ) : null}
        {v.signupMethod ? <p className="mt-1 text-xs text-white/45">Signup: {v.signupMethod}</p> : null}
        <span className="mt-2 inline-block text-xs text-[rgb(var(--om-neon))] underline">
          {v.bookable ? "View schedule and book →" : "View listing →"}
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
    title: `Open Mics in ${place} | Schedules & Upcoming`,
    description: `Trusted open mic nights in ${place} for music, comedy, poetry and more. See schedules and signup details on MicStage.`,
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
  const nearbyLocations = await relatedLocationsForLocationSlug(locationSlug, 6);

  const todayWeekday = jsDayToWeekday(new Date().getDay());
  const tonight = listings.filter((l) => (l.scheduleWeekdays ?? []).includes(todayWeekday));
  const tonightLabel = weekdayToLabel(todayWeekday);
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
              Trusted open-mic listings in {placeTitle}. Browse venues and rooms with schedules and signup details when
              available — music, comedy, poetry, and more.
            </p>
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
            {tonight.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Open mics scheduled for {tonightLabel}</h2>
                <p className="mt-1 text-xs text-white/55">
                  Based on recurring {tonightLabel} schedules on file — not a live confirmation that tonight&apos;s night
                  is running. Confirm with the venue before you go.
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{tonight.map(listingCard)}</ul>
              </section>
            ) : (
              <p className="text-sm text-white/50">
                No recurring {tonightLabel} schedules are on file for {placeTitle} right now. Browse the full list
                below, or{" "}
                <Link href="/find-open-mics" className="underline hover:text-white">
                  search near you
                </Link>
                .
              </p>
            )}

            {thisWeekByDay.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Recurring nights this week</h2>
                <p className="mt-1 text-xs text-white/55">
                  From published weekly schedules — confirm with the venue before you go.
                </p>
                <div className="mt-3 grid gap-3">
                  {thisWeekByDay.map((g) => (
                    <div key={g.day}>
                      <h3 className="text-sm font-medium text-white/80">{g.label}</h3>
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/70">
                        {g.rows.map((v) => (
                          <li key={`${g.day}-${v.slug}`}>
                            <Link href={v.href} className="underline hover:text-white">
                              {v.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="text-lg font-semibold">Open mics in {placeTitle}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">{listings.map(listingCard)}</ul>
            </section>

            {bookable.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Signups open on MicStage</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{bookable.map(listingCard)}</ul>
              </section>
            ) : null}

            {comedy.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Comedy open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{comedy.map(listingCard)}</ul>
              </section>
            ) : null}

            {music.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Music open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{music.map(listingCard)}</ul>
              </section>
            ) : null}

            {spoken.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold">Poetry &amp; spoken word open mics</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{spoken.map(listingCard)}</ul>
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
          <Link href="/map" className="underline hover:text-white">
            Open mic map
          </Link>
        </p>
      </main>
    </div>
  );
}
