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
import { loadNearbyPublicListings, loadPublicOpenMicListingBySlug } from "@/lib/publicListings/queries";
import { isPublicListingRenderable, suggestCanonicalListingName } from "@/lib/publicListings/listingQuality";
import {
  isPublicListingSourceUrl,
  publicListingSourceLabel,
  sanitizePublicListingAbout,
} from "@/lib/publicListings/listingAboutFromLead";
import {
  listingMeetsPublicSeoIndexGate,
  listingPlaceLabel,
  publicListingSeoDescription,
  publicListingSeoTitle,
  buildListingEventJsonLd,
} from "@/lib/publicListings/listingSeo";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { displayListingAddress } from "@/lib/publicListings/discoveryMerge";
import { minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { primaryDiscoverySlugForVenue, getVenueCityDiscoveryCounts } from "@/lib/discoveryMarket";

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
      index: false,
    });
  }
  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing || !isPublicListingRenderable(listing)) {
    return buildPublicMetadata({
      title: "Listing not found",
      description: "This open mic listing could not be found.",
      path,
      index: false,
    });
  }
  const title = publicListingSeoTitle({ ...listing, name: suggestCanonicalListingName(listing.name) ?? listing.name });
  const description = publicListingSeoDescription({ ...listing, name: suggestCanonicalListingName(listing.name) ?? listing.name });
  const indexable = listingMeetsPublicSeoIndexGate(listing);
  return {
    ...buildPublicMetadata({ title, description, path, index: indexable }),
    title: { absolute: `${title} | MicStage` },
  };
}

export default async function PublicOpenMicListingPage(props: {
  params: Promise<{ listingSlug: string }>;
  searchParams: Promise<{ growthLead?: string }>;
}) {
  const { listingSlug } = await props.params;
  const { growthLead } = await props.searchParams;
  if (!isValidPublicSlug(listingSlug)) notFound();

  const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;
  const traceId = typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim()) ? growthLead.trim() : "";

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Listing unavailable" />;

  if (traceId) {
    await advanceGrowthLeadAcquisitionStage(prisma, traceId, "CLICKED", { leadType: "VENUE" });
  }

  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing) notFound();

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) redirect(`/venues/${venue.slug}`);
  }

  // Hide rejected/stale (OUTDATED), removed, undiscovered (UNVERIFIED), and junk-named
  // rows entirely. VERIFIED renders publicly; NEEDS_REVIEW renders (noindexed,
  // absent from browse) so claim-invite recipients can still reach it.
  if (!isPublicListingRenderable(listing)) notFound();

  const displayName = suggestCanonicalListingName(listing.name) ?? listing.name;
  const publicAbout = sanitizePublicListingAbout(listing.about);
  const sourceLabel = publicListingSourceLabel(listing.sourceName);
  const sourceHref = isPublicListingSourceUrl(listing.sourceUrl) ? listing.sourceUrl!.trim() : null;
  const nearby = await loadNearbyPublicListings(prisma, {
    excludeSlug: listing.slug,
    city: listing.city,
    region: listing.region,
    limit: 6,
  });
  const listingType = [...new Set(listing.schedules.map((s) => performanceFormatLabel(s.performanceFormat)).filter(Boolean))];

  const place = listingPlaceLabel(listing.city, listing.region);
  const path = `/open-mics/${listing.slug}`;
  const kind = listing.verificationStatus === "VERIFIED" ? "verified" : "unclaimed";

  let cityHref: string | null = null;
  const city = (listing.city ?? "").trim();
  if (city) {
    try {
      const counts = await getVenueCityDiscoveryCounts();
      const slug = primaryDiscoverySlugForVenue(city, listing.region, counts);
      if (slug) cityHref = `/locations/${slug}/open-mics`;
    } catch {
      cityHref = null;
    }
  }

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
    name: displayName,
    ...(listing.formattedAddress?.trim()
      ? { address: listing.formattedAddress.trim() }
      : {}),
    ...(listing.lat != null && listing.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng } }
      : {}),
    url: absoluteUrl(path),
  };

  const breadcrumbItems: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Find open mics", item: absoluteUrl("/find-open-mics") },
  ];
  if (cityHref && place) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: `Open mics in ${place}`,
      item: absoluteUrl(cityHref),
    });
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 3,
      name: displayName,
      item: absoluteUrl(path),
    });
  } else {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: displayName,
      item: absoluteUrl(path),
    });
  }

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  // Public listings store recurring weekdays only — never synthesize Event startDate.
  // Event JSON-LD requires concrete occurrence startDate (none for typical listings).
  const eventJsonLd = buildListingEventJsonLd({
    listingName: displayName,
    formattedAddress: listing.formattedAddress,
    url: absoluteUrl(path),
    occurrences: [],
  });

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
          {cityHref && place ? (
            <>
              <span className="mx-2">/</span>
              <Link href={cityHref} className="hover:text-white">
                {place}
              </Link>
            </>
          ) : null}
          <span className="mx-2">/</span>
          <span className="text-white/80">{displayName}</span>
        </nav>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <DiscoveryListingBadge kind={kind} bookable={false} hasSchedule={listing.schedules.length > 0} />
            {listing.lastVerifiedAt ? (
              <span className="text-xs text-white/50">
                Schedule last confirmed{" "}
                {listing.lastVerifiedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            ) : null}
          </div>
          <h1 className="om-heading mt-3 text-3xl sm:text-4xl">{displayName}</h1>
          {(() => {
            const addr = displayListingAddress(listing.name, listing.formattedAddress, listing.city, listing.region);
            if (!addr && !place) return null;
            if (addr && place && addr.toLowerCase() === place.toLowerCase()) {
              return <p className="mt-2 text-sm text-white/70">{place}</p>;
            }
            return (
              <>
                {addr ? <p className="mt-2 text-sm text-white/70">{addr}</p> : null}
                {place && addr?.toLowerCase() !== place.toLowerCase() ? (
                  <p className="text-sm text-white/55">{place}</p>
                ) : null}
              </>
            );
          })()}
        </header>

        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
          {traceId
            ? "This is your open mic on MicStage — claim it free to manage schedule, signups, and lineup."
            : "Listed by MicStage. This open mic is not yet managed by the venue."}
        </div>

        {publicAbout ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{publicAbout}</p>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Schedule</h2>
          {listing.schedules.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">Schedule not published yet — check with the venue before going.</p>
          ) : (
            <>
              <ul className="mt-3 grid gap-3">
                {listing.schedules.map((s) => (
                  <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="font-semibold">Weekly on {weekdayToLabel(s.weekday)}</div>
                    <div className="mt-1 text-sm text-white/75">
                      {minutesToTimeLabel(s.startTimeMin)} – {minutesToTimeLabel(s.endTimeMin)}
                      {s.title ? ` · ${s.title}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/55">{performanceFormatLabel(s.performanceFormat)}</div>
                    {s.signupMethod ? <div className="mt-2 text-xs text-white/60">Signup: {s.signupMethod}</div> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-white/50">
                Schedule may have changed — check with the venue before going.
              </p>
            </>
          )}
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {listingType.length > 0 ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Type</h3>
              <p className="mt-1 text-sm">{listingType.join(" · ")}</p>
            </div>
          ) : null}
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

        {(sourceLabel || sourceHref) && (
          <section className="mt-6 text-xs text-white/45">
            {sourceLabel ? <span>Source: {sourceLabel}</span> : null}
            {sourceHref ? (
              <>
                {sourceLabel ? " · " : ""}
                <a href={safeExternalHref(sourceHref)!} target="_blank" rel="noopener noreferrer" className="underline">
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
              href={`/claim/${listing.slug}${traceId ? `?growthLead=${encodeURIComponent(traceId)}` : ""}`}
              className="mt-3 inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
              data-track-event="listing_claim_cta_click"
              data-listing-slug={listing.slug}
            >
              {traceId ? "Claim this open mic free" : "Claim this open mic"}
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

          {nearby.length > 0 ? (
            <div>
              <h2 className="text-base font-semibold">Nearby open mics</h2>
              <ul className="mt-3 grid gap-2">
                {nearby.map((n) => (
                  <li key={n.slug}>
                    <Link href={`/open-mics/${n.slug}`} className="text-sm text-[rgb(var(--om-neon))] underline">
                      {n.name}
                    </Link>
                    {n.city ? <span className="ml-2 text-xs text-white/50">{n.city}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
