import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { getClaimInviteSession } from "@/lib/publicListings/claimInviteSession";
import { claimFunnelEventFromClient, recordClaimFunnelEvent } from "@/lib/publicListings/claimFunnelEvents";
import { consumeRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Session-bound claim funnel beacons. No PII in body or audit meta.
 */
export async function POST(request: Request) {
  const prisma = getPrismaOrNull();
  if (!prisma) return NextResponse.json({ ok: true, skipped: "no_db" });

  let body: { event?: string; listingSlug?: string };
  try {
    body = (await request.json()) as { event?: string; listingSlug?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventType = claimFunnelEventFromClient(typeof body.event === "string" ? body.event : "");
  if (!eventType) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });

  const session = await getClaimInviteSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: session.listingId },
    select: { id: true, slug: true, growthLeadId: true },
  });
  if (!listing) return NextResponse.json({ ok: false, error: "listing" }, { status: 404 });
  if (body.listingSlug && body.listingSlug.trim() !== listing.slug) {
    return NextResponse.json({ ok: false, error: "listing_mismatch" }, { status: 400 });
  }

  const rl = await consumeRateLimit({
    scope: "claim:funnel",
    identifier: session.tokenId.slice(0, 16),
    limit: 40,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) return NextResponse.json({ ok: true, skipped: "rate" });

  try {
    await recordClaimFunnelEvent(prisma, {
      listingId: listing.id,
      eventType,
      dedupeMs: 15 * 60 * 1000,
      meta: {
        listingSlug: listing.slug,
        tokenId: session.tokenId,
        growthLeadId: listing.growthLeadId,
      },
    });
  } catch {
    return NextResponse.json({ ok: true, skipped: "error" });
  }

  return NextResponse.json({ ok: true });
}
