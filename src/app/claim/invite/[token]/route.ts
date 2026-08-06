import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { peekListingClaimInviteToken } from "@/lib/publicListings/claimInviteToken";
import { attachClaimInviteSessionCookie } from "@/lib/publicListings/claimInviteSession";
import { consumeRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function baseUrl(request: Request): string {
  const env = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/**
 * GET /claim/invite/[token]
 * Exchange raw URL token → HttpOnly session cookie → redirect to clean /claim/invite.
 * Must be a Route Handler (not RSC) so Set-Cookie is allowed.
 * Does not consume the one-time invite token (submission does).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const origin = baseUrl(request);

  if (!token || token.length < 32 || !/^[a-f0-9]{32,128}$/i.test(token)) {
    return NextResponse.redirect(new URL("/claim/invite", origin));
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.redirect(new URL("/claim/invite?err=unavailable", origin));
  }

  const rl = await consumeRateLimit({
    scope: "claim:invite:exchange",
    identifier: token.slice(0, 16),
    limit: 40,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/claim/invite?err=rate", origin));
  }

  const peeked = await peekListingClaimInviteToken(prisma, token);
  if (!peeked.ok) {
    return NextResponse.redirect(new URL("/claim/invite?err=invalid", origin));
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: peeked.listingId },
    select: { id: true, slug: true, claimedVenueId: true },
  });
  if (!listing) {
    return NextResponse.redirect(new URL("/claim/invite?err=invalid", origin));
  }

  if (listing.claimedVenueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { slug: true },
    });
    if (venue) {
      return NextResponse.redirect(new URL(`/venues/${venue.slug}`, origin));
    }
  }

  const tokenRow = await prisma.listingClaimInviteToken.findUnique({
    where: { id: peeked.tokenId },
    select: { expiresAt: true },
  });
  const remainingSec = tokenRow
    ? Math.max(60, Math.floor((tokenRow.expiresAt.getTime() - Date.now()) / 1000))
    : 60 * 60 * 2;
  const sessionTtl = Math.min(60 * 60 * 2, remainingSec);

  const res = NextResponse.redirect(new URL("/claim/invite", origin));
  try {
    await attachClaimInviteSessionCookie(
      res,
      {
        tokenId: peeked.tokenId,
        listingId: peeked.listingId,
        intendedEmailNormalized: peeked.intendedEmailNormalized,
      },
      sessionTtl,
    );
  } catch {
    return NextResponse.redirect(new URL("/claim/invite?err=session", origin));
  }

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

  return res;
}
