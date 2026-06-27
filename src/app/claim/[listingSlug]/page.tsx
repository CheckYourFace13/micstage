import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClaimListingForm } from "@/components/publicListings/ClaimListingForm";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";
import { getPrismaOrNull } from "@/lib/prisma";
import { loadPublicOpenMicListingBySlug } from "@/lib/publicListings/queries";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ listingSlug: string }> }): Promise<Metadata> {
  const { listingSlug } = await props.params;
  return buildPublicMetadata({
    title: "Claim this open mic",
    description: "Venue hosts and managers can claim a verified MicStage listing.",
    path: `/claim/${listingSlug}`,
  });
}

export default async function ClaimListingPage(props: { params: Promise<{ listingSlug: string }> }) {
  const { listingSlug } = await props.params;
  if (!isValidPublicSlug(listingSlug)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Claim form unavailable" />;

  const listing = await loadPublicOpenMicListingBySlug(prisma, listingSlug);
  if (!listing) notFound();

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
        <h1 className="om-heading mt-4 text-3xl">Claim this open mic</h1>
        <p className="mt-2 text-sm text-white/70">
          Run <span className="font-semibold text-white">{listing.name}</span>? Tell us who you are and we&apos;ll connect
          this listing to a MicStage venue account.
        </p>
        <div className="mt-8">
          <ClaimListingForm listingSlug={listing.slug} listingName={listing.name} />
        </div>
      </main>
    </div>
  );
}
