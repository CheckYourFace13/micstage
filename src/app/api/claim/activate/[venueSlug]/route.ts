import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { refreshListingPromotionEligible } from "@/lib/publicListings/listingClaimInviteEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ venueSlug: string }> },
) {
  const { venueSlug } = await context.params;
  const prisma = getPrismaOrNull();
  if (!prisma) return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });

  const session = await getSession();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true, ownerId: true, claimedFromListing: { select: { id: true } } },
  });
  if (!venue || venue.ownerId !== session.venueOwnerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim().slice(0, 500) : null;
  const slotMinutes = Math.min(60, Math.max(5, Number(body.slotMinutes) || 10));
  const breakMinutes = Math.min(30, Math.max(0, Number(body.breakMinutes) || 0));
  const bookingOpensDaysAhead = Math.min(180, Math.max(1, Number(body.bookingOpensDaysAhead) || 60));
  const bookingRestrictionMode =
    body.bookingRestrictionMode === "HOURS_BEFORE" || body.bookingRestrictionMode === "ON_PREMISE"
      ? body.bookingRestrictionMode
      : "NONE";
  const publishSchedule = body.publishSchedule === true;
  // Booking is never inferred from EventTemplate existence — owner must opt in.
  const enableBooking = body.enableBooking === true && body.performerMode === "micstage_booking";
  const performerMode =
    body.performerMode === "interest_waitlist" || body.performerMode === "micstage_booking"
      ? body.performerMode
      : "info_only";

  if (!name) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.venue.update({
      where: { id: venue.id },
      data: {
        name,
        websiteUrl: websiteUrl || null,
        bookingOpensDaysAhead,
        bookingRestrictionMode: enableBooking ? bookingRestrictionMode : "NONE",
      },
    });
    await tx.eventTemplate.updateMany({
      where: { venueId: venue.id },
      data: {
        slotMinutes,
        breakMinutes,
        // Info-only / waitlist may publish schedule; booking stays NONE unless opted in.
        isPublic: publishSchedule || enableBooking,
        bookingRestrictionMode: enableBooking ? bookingRestrictionMode : "NONE",
      },
    });
    if (venue.claimedFromListing?.id) {
      await tx.listingClaimAuditEvent.create({
        data: {
          listingId: venue.claimedFromListing.id,
          eventType: "CLAIM_ACTIVATION_SAVED",
          meta: {
            publishSchedule: publishSchedule || enableBooking,
            enableBooking,
            performerMode,
            venueId: venue.id,
            bookingEnabled: enableBooking,
          },
        },
      });
    }
  });

  if (venue.claimedFromListing?.id && publishSchedule) {
    await refreshListingPromotionEligible(prisma, venue.claimedFromListing.id);
  }

  return NextResponse.json({ ok: true });
}
