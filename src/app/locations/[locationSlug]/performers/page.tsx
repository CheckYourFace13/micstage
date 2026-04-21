import Link from "next/link";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { getPrismaOrNull } from "@/lib/prisma";
import {
  assertKnownLocationSlugOrNotFound,
  canonicalLocationSlugOrNull,
  locationSlugToFallbackTitle,
  resolveLocationPlaceTitle,
} from "@/lib/locationSlugValidation";
import { getVenueCityDiscoveryCounts, venueIncludedInDiscoveryPage } from "@/lib/discoveryMarket";
import { minutesToTimeLabel } from "@/lib/time";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { relatedLocationsForLocationSlug } from "@/lib/relatedLocations";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ locationSlug: string }> }): Promise<Metadata> {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  const slug = canonical ?? locationSlug;
  const place = await resolveLocationPlaceTitle(slug);
  return buildPublicMetadata({
    title: `${place} open mic artists`,
    description: `Upcoming open mic performers across the ${place} discovery market on MicStage: public, shareable artist list (venue addresses stay exact on each venue page).`,
    path: `/locations/${slug}/performers`,
  });
}

export default async function LocationPerformersPage(props: { params: Promise<{ locationSlug: string }> }) {
  const { locationSlug } = await props.params;
  const canonical = await canonicalLocationSlugOrNull(locationSlug);
  if (canonical && canonical !== locationSlug) {
    permanentRedirect(`/locations/${canonical}/performers`);
  }
  await assertKnownLocationSlugOrNotFound(locationSlug);
  const placeTitle = await resolveLocationPlaceTitle(locationSlug);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const prisma = getPrismaOrNull();
  const discoveryCounts = await getVenueCityDiscoveryCounts();

  const bookingInclude = {
    slot: {
      include: {
        instance: {
          include: {
            template: {
              include: { venue: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.BookingInclude;

  type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

  let bookings: BookingRow[] = [];
  let venuesInArea: { id: string; slug: string; name: string; city: string | null; region: string | null }[] = [];
  let queryFailed = false;

  try {
    if (prisma) {
      const allCityBookings = await prisma.booking.findMany({
        where: {
          cancelledAt: null,
          slot: {
            instance: {
              date: { gte: today },
              template: { venue: { city: { not: null } } },
            },
          },
        },
        orderBy: [{ slot: { instance: { date: "asc" } } }, { slot: { startMin: "asc" } }],
        take: 200,
        include: bookingInclude,
      });

      bookings = allCityBookings.filter((b) => {
        const v = b.slot.instance.template.venue;
        return venueIncludedInDiscoveryPage(
          { city: v.city, region: v.region },
          locationSlug,
          discoveryCounts,
        );
      });

      const cityVenues = await prisma.venue.findMany({
        where: { city: { not: null } },
        select: { id: true, slug: true, name: true, city: true, region: true },
      });
      venuesInArea = cityVenues.filter((v) => venueIncludedInDiscoveryPage(v, locationSlug, discoveryCounts));
    }
  } catch (err) {
    console.error("DB query failed", err);
    queryFailed = true;
  }

  const shareUrl = absoluteUrl(`/locations/${locationSlug}/performers`);
  const shareText = `Who's playing upcoming open mics across ${placeTitle}?`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  const emptyMessage = queryFailed
    ? "We couldn’t load upcoming bookings for this market. Try again in a moment."
    : "No upcoming artists listed for this market yet.";
  const nearbyLocations = await relatedLocationsForLocationSlug(locationSlug, 6);
  const uniqueVenueCount = new Set(bookings.map((b) => b.slot.instance.template.venue.id)).size;
  const uniquePerformerCount = new Set(bookings.map((b) => b.performerName.toLowerCase().trim())).size;
  const upcomingDateCount = new Set(bookings.map((b) => b.slot.instance.date.toISOString().slice(0, 10))).size;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Markets", item: absoluteUrl("/locations") },
      {
        "@type": "ListItem",
        position: 2,
        name: `${placeTitle} artists`,
        item: absoluteUrl(`/locations/${locationSlug}/performers`),
      },
    ],
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${placeTitle} open mic artists`,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: bookings.length,
    itemListElement: bookings.slice(0, 50).map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.performerName,
      url: absoluteUrl(`/venues/${b.slot.instance.template.venue.slug}`),
      item: {
        "@type": "Event",
        name: b.slot.instance.template.title || `Open mic at ${b.slot.instance.template.venue.name}`,
        startDate: b.slot.instance.date.toISOString(),
        location: {
          "@type": "Place",
          name: b.slot.instance.template.venue.name,
          address:
            b.slot.instance.template.venue.formattedAddress ||
            locationSlugToFallbackTitle(locationSlug),
        },
      },
    })),
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
        {bookings.length > 0 ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Public artist list</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">{placeTitle} artists</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/70">
              Track upcoming open mic performers in {placeTitle}. MicStage groups thin towns into metro or regional
              discovery pages until a local scene has enough venues to earn its own directory; venue addresses stay exact on
              each venue page. Related markets and venue links are below.
            </p>
          </div>
          <Link className="text-sm text-white/70 hover:text-white" href="/locations">
            All markets
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-1 text-xs text-white/65 sm:grid-cols-3">
            <div>{uniquePerformerCount} upcoming performers</div>
            <div>{uniqueVenueCount} active venues</div>
            <div>{upcomingDateCount} upcoming schedule dates</div>
          </div>
          <div className="text-xs text-white/60">Share this page</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40"
              href={twitterUrl}
              target="_blank"
              rel="noreferrer"
            >
              Share on X
            </a>
            <a
              className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40"
              href={fbUrl}
              target="_blank"
              rel="noreferrer"
            >
              Share on Facebook
            </a>
            <a
              className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40"
              href={linkedInUrl}
              target="_blank"
              rel="noreferrer"
            >
              Share on LinkedIn
            </a>
          </div>
          <div className="mt-2 text-xs text-white/50 break-all">{shareUrl}</div>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">{emptyMessage}</div>
        ) : (
          <div className="mt-8 grid gap-3">
            {bookings.map((b) => {
              const inst = b.slot.instance;
              const t = inst.template;
              const v = t.venue;
              return (
                <article key={b.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{b.performerName}</h2>
                    <div className="text-xs text-white/60">
                      {inst.date.toISOString().slice(0, 10)} · {minutesToTimeLabel(b.slot.startMin)}-
                      {minutesToTimeLabel(b.slot.endMin)}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-white/75">
                    {t.title} at{" "}
                    <Link className="underline" href={`/venues/${v.slug}`}>
                      {v.name}
                    </Link>
                    {v.region ? ` (${v.city}, ${v.region})` : v.city ? ` (${v.city})` : ""}
                  </div>
                  {t.description ? (
                    <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/55">{t.description}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {venuesInArea.length > 0 ? (
          <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Venues in this discovery market ({placeTitle})</h2>
            <p className="mt-2 text-sm text-white/70">
              Browse venue pages to view recurring schedule structure, available slots, and performer booking details.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {venuesInArea.slice(0, 12).map((v) => (
                <Link
                  key={v.id}
                  href={`/venues/${v.slug}`}
                  className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm hover:bg-black/40"
                >
                  {v.name}
                  <span className="ml-2 text-xs text-white/55">
                    {v.region ? `${v.city}, ${v.region}` : v.city}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {nearbyLocations.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Related metro &amp; regional markets</h2>
            <p className="mt-2 text-sm text-white/70">
              Explore other discovery hubs {nearbyLocations[0]?.relation === "nearby" ? "nearby" : "in the same state or region"}.
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

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-3 grid gap-3 text-sm text-white/80">
            <div>
              <h3 className="font-semibold text-white">What does this page show?</h3>
              <p className="mt-1">
                Upcoming performer bookings for venues mapped to the {placeTitle} discovery market. Cancelled bookings are
                not listed.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">How do I book a slot?</h3>
              <p className="mt-1">
                Open any venue listed above and use its public schedule page. Booking buttons are shown on available slots.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">How often is this updated?</h3>
              <p className="mt-1">
                Results are rendered from current MicStage booking data and reflect upcoming activity for this market.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Guides for venues and performers</h2>
          <p className="mt-2 text-sm text-white/70">
            Learn how strong open mic operations improve discovery, performer retention, and repeat attendance.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/resources/types-of-open-mic-nights"
              className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
            >
              Types of open mic nights
            </Link>
            <Link
              href="/resources/what-performers-look-for-in-open-mics"
              className="rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-sm hover:bg-black/40"
            >
              What performers look for
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
