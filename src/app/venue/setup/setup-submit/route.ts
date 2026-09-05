import { NextResponse } from "next/server";
import tzLookup from "tz-lookup";
import { getPrismaOrNull } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { getSession } from "@/lib/session";
import { sendVenueSignupThankYouEmailIfNeeded } from "@/lib/venueSignupThankYouEmail";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { refreshListingPromotionEligible } from "@/lib/publicListings/listingClaimInviteEmail";

export const runtime = "nodejs";

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

function setupErrorPath(code: string, claimListing?: string, growthLead?: string) {
  const qs = new URLSearchParams();
  qs.set("error", code);
  if (claimListing) qs.set("claimListing", claimListing);
  if (growthLead) qs.set("growthLead", growthLead);
  return `/venue/setup?${qs.toString()}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.kind !== "venue") {
    return redirectTo("/register/venue");
  }
  const ownerId = session.venueOwnerId;
  if (!ownerId) {
    return redirectTo("/register/venue");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/venue/setup?error=unavailable");
  }

  const venueName = optString(formData, "venueName");
  const googlePlaceId = optString(formData, "googlePlaceId");
  const formattedAddress = optString(formData, "formattedAddress");
  const city = optString(formData, "city");
  const region = optString(formData, "region");
  const country = optString(formData, "country");
  const claimListing = optString(formData, "claimListing");
  const growthTraceLeadId = optString(formData, "growthTraceLeadId");
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat =
    typeof latRaw === "string" && latRaw.trim() ? Number.parseFloat(latRaw.trim()) : Number.NaN;
  const lng =
    typeof lngRaw === "string" && lngRaw.trim() ? Number.parseFloat(lngRaw.trim()) : Number.NaN;

  if (!googlePlaceId || !venueName || !formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return redirectTo(setupErrorPath("place", claimListing, growthTraceLeadId));
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return redirectTo(setupErrorPath("unavailable", claimListing, growthTraceLeadId));
  }

  const already = await prisma.venue.findFirst({
    where: { ownerId },
    select: { id: true },
  });
  if (already) return redirectTo("/venue");

  const placeTaken = await prisma.venue.findUnique({
    where: { googlePlaceId },
    select: { id: true, ownerId: true },
  });
  if (placeTaken && placeTaken.ownerId !== ownerId) {
    return redirectTo(setupErrorPath("taken", claimListing, growthTraceLeadId));
  }

  const timeZone = tzLookup(lat, lng);
  const baseSlug = slugify(venueName) || "venue";
  let slug = baseSlug;
  for (let i = 0; i < 25; i++) {
    const exists = await prisma.venue.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${baseSlug}-${i + 2}`;
  }

  try {
    const venue = await prisma.$transaction(async (tx) => {
      const created =
        placeTaken && placeTaken.ownerId === ownerId
          ? await tx.venue.update({
              where: { id: placeTaken.id },
              data: {
                name: venueName,
                formattedAddress,
                city,
                region,
                country,
                lat,
                lng,
                timeZone,
              },
            })
          : await tx.venue.create({
              data: {
                ownerId,
                name: venueName,
                slug,
                googlePlaceId,
                formattedAddress,
                city,
                region,
                country,
                lat,
                lng,
                timeZone,
              },
            });

      let claimedListingId: string | null = null;
      if (claimListing) {
        const listing = await tx.publicOpenMicListing.findUnique({
          where: { slug: claimListing },
          select: {
            id: true,
            claimedVenueId: true,
            claimStatus: true,
            schedules: {
              where: { isActive: true },
              select: {
                weekday: true,
                startTimeMin: true,
                endTimeMin: true,
                timeZone: true,
                title: true,
                description: true,
                performanceFormat: true,
              },
            },
          },
        });
        if (listing && !listing.claimedVenueId && listing.claimStatus !== "CLAIMED") {
          await tx.publicOpenMicListing.update({
            where: { id: listing.id },
            data: {
              claimedVenueId: created.id,
              claimStatus: "CLAIMED",
            },
          });
          claimedListingId = listing.id;
          await tx.listingClaimAuditEvent.create({
            data: {
              listingId: listing.id,
              eventType: "CLAIM_LINKED_AFTER_SIGNUP",
              meta: {
                venueId: created.id,
                via: "venue_setup",
              },
            },
          });

          for (const sched of listing.schedules) {
            const existing = await tx.eventTemplate.findFirst({
              where: {
                venueId: created.id,
                weekday: sched.weekday,
                startTimeMin: sched.startTimeMin,
                endTimeMin: sched.endTimeMin,
                timeZone: sched.timeZone,
              },
              select: { id: true },
            });
            if (existing) continue;
            const duration = Math.max(30, sched.endTimeMin - sched.startTimeMin);
            await tx.eventTemplate.create({
              data: {
                venueId: created.id,
                title: sched.title || venueName,
                description: sched.description,
                weekday: sched.weekday,
                startTimeMin: sched.startTimeMin,
                endTimeMin: sched.endTimeMin,
                timeZone: sched.timeZone || timeZone,
                slotMinutes: Math.min(60, Math.max(5, duration)),
                breakMinutes: 0,
                isPublic: false,
                performanceFormat: sched.performanceFormat,
                bookingRestrictionMode: "NONE",
              },
            });
          }
        }
      }

      return { venue: created, claimedListingId };
    });

    await sendVenueSignupThankYouEmailIfNeeded(prisma, venue.venue.id, session.email);
    if (venue.claimedListingId) {
      try {
        await refreshListingPromotionEligible(prisma, venue.claimedListingId);
      } catch {
        // non-fatal
      }
    }

    return redirectTo("/venue");
  } catch (e) {
    console.error("[venueSetup]", e);
    return redirectTo(setupErrorPath("unavailable", claimListing, growthTraceLeadId));
  }
}
