"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOptionalAdminEmailFromLoginForm, assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";

const LISTINGS_PATH = "/internal/admin/growth/listings";

function redirectListings(query: string) {
  redirect(`${LISTINGS_PATH}?${query}`);
}

export async function adminApproveListingClaim(formData: FormData) {
  await assertAdminSession();
  const adminEmail = (await getOptionalAdminEmailFromLoginForm()) ?? "admin";
  const claimId = String(formData.get("claimId") ?? "").trim();
  const venueSlug = String(formData.get("venueSlug") ?? "").trim();
  if (!claimId) redirectListings("err=missing_claim");

  const prisma = requirePrisma();
  const claim = await prisma.listingClaimRequest.findUnique({
    where: { id: claimId },
    include: { listing: true },
  });
  if (!claim) {
    redirectListings("err=claim_not_found");
    return;
  }

  let venueId: string | null = null;
  if (venueSlug) {
    const venue = await prisma.venue.findUnique({ where: { slug: venueSlug }, select: { id: true } });
    if (!venue) {
      redirectListings("err=venue_not_found");
      return;
    }
    venueId = venue.id;
  }

  await prisma.$transaction([
    prisma.listingClaimRequest.update({
      where: { id: claimId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByEmail: adminEmail,
      },
    }),
    prisma.publicOpenMicListing.update({
      where: { id: claim.listingId },
      data: {
        claimStatus: venueId ? "CLAIMED" : "CLAIM_PENDING",
        claimedVenueId: venueId,
      },
    }),
  ]);

  revalidatePath(LISTINGS_PATH);
  revalidatePath(`/open-mics/${claim.listing.slug}`);
  redirectListings("ok=claim_approved");
}

export async function adminRejectListingClaim(formData: FormData) {
  await assertAdminSession();
  const adminEmail = (await getOptionalAdminEmailFromLoginForm()) ?? "admin";
  const claimId = String(formData.get("claimId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!claimId) redirectListings("err=missing_claim");

  const prisma = requirePrisma();
  const claim = await prisma.listingClaimRequest.findUnique({
    where: { id: claimId },
    select: { id: true, listingId: true, listing: { select: { slug: true } } },
  });
  if (!claim) {
    redirectListings("err=claim_not_found");
    return;
  }

  await prisma.$transaction([
    prisma.listingClaimRequest.update({
      where: { id: claimId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedByEmail: adminEmail,
        reviewNotes: notes,
      },
    }),
    prisma.publicOpenMicListing.update({
      where: { id: claim.listingId },
      data: { claimStatus: "UNCLAIMED" },
    }),
  ]);

  revalidatePath(LISTINGS_PATH);
  redirectListings("ok=claim_rejected");
}

export async function adminLinkListingToVenue(formData: FormData) {
  await assertAdminSession();
  const listingId = String(formData.get("listingId") ?? "").trim();
  const venueSlug = String(formData.get("venueSlug") ?? "").trim();
  if (!listingId || !venueSlug) redirectListings("err=missing_link_fields");

  const prisma = requirePrisma();
  const venue = await prisma.venue.findUnique({ where: { slug: venueSlug }, select: { id: true } });
  if (!venue) {
    redirectListings("err=venue_not_found");
    return;
  }

  const listing = await prisma.publicOpenMicListing.update({
    where: { id: listingId },
    data: { claimedVenueId: venue.id, claimStatus: "CLAIMED" },
    select: { slug: true },
  });

  revalidatePath(LISTINGS_PATH);
  revalidatePath(`/open-mics/${listing.slug}`);
  revalidatePath(`/venues/${venueSlug}`);
  redirectListings("ok=listing_linked");
}

export async function adminSetListingVerification(formData: FormData) {
  await assertAdminSession();
  const listingId = String(formData.get("listingId") ?? "").trim();
  const status = String(formData.get("verificationStatus") ?? "").trim();
  const allowed = ["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "OUTDATED"];
  if (!listingId || !allowed.includes(status)) redirectListings("err=bad_status");

  const prisma = requirePrisma();
  const listing = await prisma.publicOpenMicListing.update({
    where: { id: listingId },
    data: {
      verificationStatus: status as "VERIFIED" | "NEEDS_REVIEW" | "UNVERIFIED" | "OUTDATED",
      lastVerifiedAt: status === "VERIFIED" ? new Date() : undefined,
    },
    select: { slug: true },
  });

  revalidatePath(LISTINGS_PATH);
  revalidatePath(`/open-mics/${listing.slug}`);
  redirectListings("ok=listing_updated");
}

export async function adminResolveListingCorrection(formData: FormData) {
  await assertAdminSession();
  const adminEmail = (await getOptionalAdminEmailFromLoginForm()) ?? "admin";
  const correctionId = String(formData.get("correctionId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!correctionId || (status !== "APPROVED" && status !== "REJECTED")) {
    redirectListings("err=bad_correction");
  }

  const prisma = requirePrisma();
  await prisma.listingCorrection.update({
    where: { id: correctionId },
    data: {
      status: status as "APPROVED" | "REJECTED",
      reviewedAt: new Date(),
      reviewedByEmail: adminEmail,
    },
  });

  revalidatePath(LISTINGS_PATH);
  redirectListings("ok=correction_resolved");
}
