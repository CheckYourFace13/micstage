import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InstantClaimForm } from "@/components/publicListings/InstantClaimForm";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { getPrismaOrNull } from "@/lib/prisma";
import { peekListingClaimInviteToken } from "@/lib/publicListings/claimInviteToken";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { consumeRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Secure claim invitation",
    description: "Claim your verified MicStage open mic listing with a signed invitation.",
    path: "/claim/invite",
    index: false,
  });
}

export default async function ClaimInviteTokenPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!token || token.length < 32 || !/^[a-f0-9]{32,128}$/i.test(token)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Claim form unavailable" />;

  const rl = await consumeRateLimit({
    scope: "claim:invite:peek",
    identifier: token.slice(0, 16),
    limit: 40,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="om-heading text-3xl">Too many attempts</h1>
          <p className="mt-3 text-sm text-white/70">Please wait and try again later.</p>
        </main>
      </div>
    );
  }

  const peeked = await peekListingClaimInviteToken(prisma, token);
  if (!peeked.ok) {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="om-heading text-3xl">Invitation unavailable</h1>
          <p className="mt-3 text-sm text-white/70">
            This claim link is no longer valid. Request a new invitation or contact MicStage support.
          </p>
          <Link href="/" className="mt-6 inline-block text-[rgb(var(--om-neon))] underline">
            Back home
          </Link>
        </main>
      </div>
    );
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: peeked.listingId },
    select: {
      id: true,
      slug: true,
      name: true,
      formattedAddress: true,
      city: true,
      region: true,
      claimedVenueId: true,
      claimStatus: true,
      verificationStatus: true,
      about: true,
      schedules: {
        where: { isActive: true },
        select: { weekday: true, startTimeMin: true, endTimeMin: true, title: true },
        take: 5,
      },
    },
  });
  if (!listing) notFound();

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) redirect(`/venues/${venue.slug}`);
  }

  const scheduleBits = listing.schedules.map((s) => {
    const sh = Math.floor(s.startTimeMin / 60);
    const sm = String(s.startTimeMin % 60).padStart(2, "0");
    return `${s.weekday} ${sh}:${sm}${s.title ? ` (${s.title})` : ""}`;
  });
  const evidenceSummary =
    scheduleBits.length > 0
      ? `Recurring schedule on file: ${scheduleBits.join("; ")}.`
      : listing.about?.slice(0, 180) || null;

  // Prefill shows domain-safe hint only — full invited email is required for confirmation.
  const invitedEmail = peeked.intendedEmailNormalized;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/open-mics/${listing.slug}`} className="text-sm text-[rgb(var(--om-neon))] underline">
          ← View public listing
        </Link>
        <h1 className="om-heading mt-4 text-3xl">Claim your open mic</h1>
        <p className="mt-2 text-sm text-white/70">
          Secure invitation for <span className="font-semibold text-white">{listing.name}</span>. Claiming is free.
        </p>
        <div className="mt-8">
          <InstantClaimForm
            listingSlug={listing.slug}
            listingName={listing.name}
            rawToken={token}
            invitedEmail={invitedEmail}
            address={listing.formattedAddress}
            evidenceSummary={evidenceSummary}
          />
        </div>
      </main>
    </div>
  );
}
