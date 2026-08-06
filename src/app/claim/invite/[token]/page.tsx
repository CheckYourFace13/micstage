import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { getPrismaOrNull } from "@/lib/prisma";
import { peekListingClaimInviteToken } from "@/lib/publicListings/claimInviteToken";
import { setClaimInviteSession } from "@/lib/publicListings/claimInviteSession";
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

/**
 * Exchange raw URL token for an HttpOnly claim session, then redirect to a clean URL.
 * Does not consume the one-time invite token (submission does).
 */
export default async function ClaimInviteTokenExchangePage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  if (!token || token.length < 32 || !/^[a-f0-9]{32,128}$/i.test(token)) notFound();

  const prisma = getPrismaOrNull();
  if (!prisma) return <PublicDataUnavailable title="Claim form unavailable" />;

  const rl = await consumeRateLimit({
    scope: "claim:invite:exchange",
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
    select: { id: true, slug: true, claimedVenueId: true },
  });
  if (!listing) notFound();

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) redirect(`/venues/${venue.slug}`);
  }

  const tokenRow = await prisma.listingClaimInviteToken.findUnique({
    where: { id: peeked.tokenId },
    select: { expiresAt: true },
  });
  const remainingSec = tokenRow
    ? Math.max(60, Math.floor((tokenRow.expiresAt.getTime() - Date.now()) / 1000))
    : 60 * 60 * 2;
  const sessionTtl = Math.min(60 * 60 * 2, remainingSec);

  await setClaimInviteSession(
    {
      tokenId: peeked.tokenId,
      listingId: peeked.listingId,
      intendedEmailNormalized: peeked.intendedEmailNormalized,
    },
    sessionTtl,
  );

  // Privacy-safe open tracking — no IP, no full email.
  await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: peeked.listingId,
      eventType: "CLAIM_INVITE_OPENED",
      meta: {
        tokenId: peeked.tokenId,
        emailDomain: peeked.intendedEmailNormalized.includes("@")
          ? peeked.intendedEmailNormalized.slice(peeked.intendedEmailNormalized.indexOf("@") + 1)
          : null,
      },
    },
  });

  redirect("/claim/invite");
}
