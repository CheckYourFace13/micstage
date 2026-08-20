import Link from "next/link";
import type { Metadata } from "next";
import { InstantClaimForm } from "@/components/publicListings/InstantClaimForm";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { getPrismaOrNull } from "@/lib/prisma";
import {
  CLAIM_AUTHORITY_AFFIRMATION,
  getClaimInviteSession,
  maskClaimInviteEmail,
} from "@/lib/publicListings/claimInviteSession";
import { consumeListingClaimInviteTokenById } from "@/lib/publicListings/claimInviteToken";
import { sanitizePublicListingAbout } from "@/lib/publicListings/listingAboutFromLead";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Claim your open mic",
    description: "Complete your MicStage open mic claim invitation.",
    path: "/claim/invite",
    index: false,
    follow: false,
  });
}

/**
 * Clean claim form URL — session from prior token exchange. No raw token in HTML.
 * Do not call cookies().set here (RSC) — exchange/clear happen in Route Handlers.
 */
export default async function ClaimInviteSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Claim form unavailable" />;

  const sp = await searchParams;
  if (sp.err === "rate") {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="om-heading text-3xl">Too many attempts</h1>
          <p className="mt-3 text-sm text-white/70">Please wait and try again later.</p>
        </main>
      </div>
    );
  }

  const session = await getClaimInviteSession();
  if (!session) {
    const title =
      sp.err === "invalid"
        ? "Invitation unavailable"
        : sp.err === "session"
          ? "Secure session unavailable"
          : "Invitation session expired";
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="om-heading text-3xl">{title}</h1>
          <p className="mt-3 text-sm text-white/70">
            Open the secure link from your email again to continue. Claiming is free.
          </p>
          <Link href="/" className="mt-6 inline-block text-[rgb(var(--om-neon))] underline">
            Back home
          </Link>
        </main>
      </div>
    );
  }

  const peeked = await consumeListingClaimInviteTokenById(prisma, {
    tokenId: session.tokenId,
    listingId: session.listingId,
    markUsed: false,
  });
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
    where: { id: session.listingId },
    select: {
      id: true,
      slug: true,
      name: true,
      formattedAddress: true,
      city: true,
      region: true,
      claimedVenueId: true,
      about: true,
      schedules: {
        where: { isActive: true },
        select: { weekday: true, startTimeMin: true, endTimeMin: true, title: true },
        take: 5,
      },
    },
  });
  if (!listing) {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="om-heading text-3xl">Listing unavailable</h1>
        </main>
      </div>
    );
  }

  // Privacy-safe funnel: page reached (no email, no token).
  await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: listing.id,
      eventType: "CLAIM_PAGE_REACHED",
      meta: { listingSlug: listing.slug },
    },
  });

  const scheduleBits = listing.schedules.map((s) => {
    const sh = Math.floor(s.startTimeMin / 60);
    const sm = String(s.startTimeMin % 60).padStart(2, "0");
    return `${s.weekday} ${sh}:${sm}${s.title ? ` (${s.title})` : ""}`;
  });
  const evidenceSummary =
    scheduleBits.length > 0
      ? `Recurring schedule on file: ${scheduleBits.join("; ")}.`
      : sanitizePublicListingAbout(listing.about)?.slice(0, 180) || null;

  const invitedEmailMasked = maskClaimInviteEmail(session.intendedEmailNormalized);
  const cityLine = [listing.city, listing.region].filter(Boolean).join(", ") || null;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/open-mics/${listing.slug}`} className="text-sm text-[rgb(var(--om-neon))] underline">
          ← View public listing
        </Link>
        <div className="mt-8">
          <InstantClaimForm
            listingSlug={listing.slug}
            listingName={listing.name}
            invitedEmailMasked={invitedEmailMasked}
            address={listing.formattedAddress}
            cityLine={cityLine}
            evidenceSummary={evidenceSummary}
            authorityAffirmation={CLAIM_AUTHORITY_AFFIRMATION}
          />
        </div>
      </main>
    </div>
  );
}
