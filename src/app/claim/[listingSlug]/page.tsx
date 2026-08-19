import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClaimListingForm } from "@/components/publicListings/ClaimListingForm";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadPublicOpenMicListingBySlug } from "@/lib/publicListings/queries";
import { isPublicListingRenderable } from "@/lib/publicListings/listingQuality";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ listingSlug: string }> }): Promise<Metadata> {
  const { listingSlug } = await props.params;
  return buildPublicMetadata({
    title: "Claim this open mic",
    description: "Venue hosts and managers can claim a verified MicStage listing.",
    path: `/claim/${listingSlug}`,
    index: false,
    follow: false,
  });
}

export default async function ClaimListingPage(props: { params: Promise<{ listingSlug: string }> }) {
  const { listingSlug } = await props.params;
  if (!isValidPublicSlug(listingSlug)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Claim form unavailable" />;

  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing || !isPublicListingRenderable(listing)) notFound();

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) redirect(`/venues/${venue.slug}`);
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/open-mics/${listing.slug}`} className="text-sm text-[rgb(var(--om-neon))] underline">
          ← Back to listing
        </Link>
        <h1 className="om-heading mt-4 text-3xl">Who runs this open mic?</h1>
        <p className="mt-2 text-sm text-white/70">
          <span className="font-semibold text-white">{listing.name}</span> — choose how you relate to this listing.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/host"
            className="rounded-xl border border-violet-400/35 bg-violet-500/15 p-4 text-sm hover:bg-violet-500/25"
          >
            <p className="font-semibold text-white">I host this open mic</p>
            <p className="mt-1 text-white/70">Connect as a Host — manage nights, signups, and lineups. You don&apos;t need to own the venue.</p>
          </Link>
          <Link
            href={`/register/venue?claimListing=${listing.slug}`}
            className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm hover:bg-white/10"
          >
            <p className="font-semibold text-white">I manage this venue</p>
            <p className="mt-1 text-white/70">Claim the venue business profile — address, photos, and venue-wide settings.</p>
          </Link>
        </div>
        <p className="mt-6 text-xs text-white/50">Or submit a manual claim request below.</p>
        <div className="mt-8">
          <ClaimListingForm listingSlug={listing.slug} listingName={listing.name} />
        </div>
      </main>
    </div>
  );
}
