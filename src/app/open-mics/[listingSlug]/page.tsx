import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DiscoveryListingBadge } from "@/components/discovery/DiscoveryListingBadge";
import { ListingCorrectionForm } from "@/components/publicListings/ListingCorrectionForm";
import { ListingReminderForm } from "@/components/publicListings/ListingReminderForm";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { safeExternalHref } from "@/lib/externalUrl";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadPublicOpenMicListingBySlug } from "@/lib/publicListings/queries";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { performanceFormatLabel } from "@/lib/venueDisplay";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ listingSlug: string }> }): Promise<Metadata> {
  const { listingSlug } = await props.params;
  if (!isValidPublicSlug(listingSlug)) notFound();
  const path = `/open-mics/${listingSlug}`;
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return buildPublicMetadata({
      title: "Open mic listing",
      description: "Verified open mic listings on MicStage.",
      path,
    });
  }
  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing) {
    return buildPublicMetadata({ title: "Listing not found", description: "This open mic listing could not be found.", path });
  }
  const place = [listing.city, listing.region].filter(Boolean).join(", ");
  const title = place ? `${listing.name} open mic | ${place}` : `${listing.name} open mic`;
  const description = `Open mic at ${listing.name}${place ? ` in ${place}` : ""}. Schedule, signup info, and host details — verified listing on MicStage.`;
  return {
    ...buildPublicMetadata({ title, description, path }),
    title: { absolute: `${title} | MicStage` },
  };
}

export default async function PublicOpenMicListingPage(props: { params: Promise<{ listingSlug: string }> }) {
  const { listingSlug } = await props.params;
  if (!isValidPublicSlug(listingSlug)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Listing unavailable" />;

  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing) notFound();

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) redirect(`/venues/${venue.slug}`);
  }

  const place = [listing.city, listing.region].filter(Boolean).join(", ");
  const path = `/open-mics/${listing.slug}`;
  const kind =
    listing.verificationStatus === "VERIFIED" || listing.verificationStatus === "NEEDS_REVIEW"
      ? "verified"
      : "unclaimed";

  const socials = [
    { label: "Website", href: safeExternalHref(listing.websiteUrl) },
    { label: "Facebook", href: safeExternalHref(listing.facebookUrl) },
    { label: "Instagram", href: safeExternalHref(listing.instagramUrl) },
    { label: "TikTok", href: safeExternalHref(listing.tiktokUrl) },
    { label: "YouTube", href: safeExternalHref(listing.youtubeUrl) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  const jsonLdLocalBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    address: listing.formattedAddress,
    ...(listing.lat != null && listing.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng } }
      : {}),
    url: absoluteUrl(path),
  };

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Find open mics", item: absoluteUrl("/find-open-mics") },
      { "@type": "ListItem", position: 2, name: listing.name, item: absoluteUrl(path) },
    ],
  };

  const eventJsonLd = listing.schedules.map((s) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: s.title ?? `${listing.name} open mic`,
    location: { "@type": "Place", name: listing.name, address: listing.formattedAddress },
    eventSchedule: {
      "@type": "Schedule",
      byDay: s.weekday,
      startTime: minutesToTimeLabel(s.startTimeMin),
      endTime: minutesToTimeLabel(s.endTimeMin),
    },
  }));

  return (
    <div className="min-h-dvh bg-black text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdLocalBusiness) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }} />
      {eventJsonLd.map((ev, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ev) }} />
      ))}

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="text-xs text-white/50">
          <Link href="/find-open-mics" className="hover:text-white">
            Find open mics
          </Link>
          <span className="mx-2">/</span>
          <span className="text-white/80">{listing.name}</span>
        </nav>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <DiscoveryListingBadge kind={kind} bookable={false} />
            {listing.lastVerifiedAt ? (
              <span className="text-xs text-white/50">
                Verified {listing.lastVerifiedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            ) : null}
          </div>
          <h1 className="om-heading mt-3 text-3xl sm:text-4xl">{listing.name}</h1>
          <p className="mt-2 text-sm text-white/70">{listing.formattedAddress}</p>
          {place ? <p className="text-sm text-white/55">{place}</p> : null}
        </header>

        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
          Listed by MicStage. This open mic is not yet managed by the venue.
        </div>

        {listing.about ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{listing.about}</p>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Schedule</h2>
          {listing.schedules.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">Schedule details coming soon.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {listing.schedules.map((s) => (
                <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="font-semibold">{weekdayToLabel(s.weekday)}</div>
                  <div className="mt-1 text-sm text-white/75">
                    {minutesToTimeLabel(s.startTimeMin)} – {minutesToTimeLabel(s.endTimeMin)}
                    {s.title ? ` · ${s.title}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/55">{performanceFormatLabel(s.performanceFormat)}</div>
                  {s.signupMethod ? <div className="mt-2 text-xs text-white/60">Signup: {s.signupMethod}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {listing.hostName ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Host</h3>
              <p className="mt-1 text-sm">{listing.hostName}</p>
            </div>
          ) : null}
          {listing.signupMethod ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Signup</h3>
              <p className="mt-1 text-sm">{listing.signupMethod}</p>
            </div>
          ) : null}
          {listing.cost ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Cost</h3>
              <p className="mt-1 text-sm">{listing.cost}</p>
            </div>
          ) : null}
          {listing.ageRestriction ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Age</h3>
              <p className="mt-1 text-sm">{listing.ageRestriction}</p>
            </div>
          ) : null}
        </section>

        {listing.equipmentNotes ? (
          <section className="mt-6">
            <h3 className="text-sm font-semibold">Equipment</h3>
            <p className="mt-1 text-sm text-white/70">{listing.equipmentNotes}</p>
          </section>
        ) : null}

        {socials.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-sm font-semibold">Links</h3>
            <ul className="mt-2 flex flex-wrap gap-3 text-sm">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[rgb(var(--om-neon))] underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(listing.sourceName || listing.sourceUrl) && (
          <section className="mt-6 text-xs text-white/45">
            Source: {listing.sourceName ?? "MicStage research"}
            {listing.sourceUrl ? (
              <>
                {" · "}
                <a href={safeExternalHref(listing.sourceUrl)!} target="_blank" rel="noopener noreferrer" className="underline">
                  View source
                </a>
              </>
            ) : null}
          </section>
        )}

        <section className="mt-10 grid gap-6 border-t border-white/10 pt-8">
          <div>
            <h2 className="text-lg font-semibold">Run this open mic?</h2>
            <p className="mt-1 text-sm text-white/65">Claim this page to manage schedule, bookings, and lineup on MicStage.</p>
            <Link
              href={`/claim/${listing.slug}`}
              className="mt-3 inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
            >
              Claim this open mic
            </Link>
          </div>

          <div>
            <h2 className="text-base font-semibold">Get reminders</h2>
            <p className="mt-1 text-sm text-white/60">Email when this listing is updated or bookable on MicStage.</p>
            <div className="mt-3">
              <ListingReminderForm listingSlug={listing.slug} city={listing.city} region={listing.region} />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold">Suggest a correction</h2>
            <div className="mt-3">
              <ListingCorrectionForm listingSlug={listing.slug} listingName={listing.name} />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold">Share</h2>
            <p className="mt-1 text-sm text-white/60">
              Link:{" "}
              <span className="font-mono text-xs text-white/80">{absoluteUrl(path)}</span>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
