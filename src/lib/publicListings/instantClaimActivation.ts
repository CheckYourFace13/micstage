/**
 * Transactional official-domain instant claim activation.
 * Creates/links VenueOwner + Venue, imports schedules, never sets plaintext passwords.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { slugify } from "@/lib/slug";
import {
  CLAIM_AUTHORITY_ROLES,
  evaluateInstantClaimAutoApproval,
  type ClaimAuthorityRole,
} from "@/lib/publicListings/claimAutoApproval";
import {
  consumeListingClaimInviteToken,
  peekListingClaimInviteToken,
} from "@/lib/publicListings/claimInviteToken";
import { createPasswordReset } from "@/lib/passwordReset";
import { REGISTRATION_CONTENT_CONSENT_VERSION } from "@/lib/registrationConsent";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";

const UNUSABLE_PASSWORD_PREFIX = "claim-pending-setup:";

async function uniqueVenueSlug(prisma: PrismaClient, base: string): Promise<string> {
  const slug = slugify(base) || `venue-${Date.now().toString(36)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const exists = await prisma.venue.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

export type SubmitInstantClaimInput = {
  rawToken: string;
  listingSlug: string;
  contactName: string;
  role: ClaimAuthorityRole;
  loginEmail: string;
  authorityConfirmed: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

export type SubmitInstantClaimResult =
  | {
      ok: true;
      decision: "AUTO_APPROVED";
      venueId: string;
      venueSlug: string;
      ownerId: string;
      listingId: string;
      passwordSetupSent: boolean;
      activationPath: string;
    }
  | {
      ok: true;
      decision: "MANUAL_REVIEW";
      claimRequestId: string;
      reason: string;
    }
  | { ok: false; error: string; status: number };

export async function submitInstantClaim(
  prisma: PrismaClient,
  input: SubmitInstantClaimInput,
): Promise<SubmitInstantClaimResult> {
  const loginEmail = normalizeMarketingEmail(input.loginEmail);
  if (!loginEmail) return { ok: false, error: "Invalid login email", status: 400 };
  if (!input.contactName.trim()) return { ok: false, error: "Name required", status: 400 };
  if (!CLAIM_AUTHORITY_ROLES.includes(input.role)) {
    return { ok: false, error: "Invalid role", status: 400 };
  }
  if (!input.authorityConfirmed || !input.termsAccepted || !input.privacyAccepted) {
    return { ok: false, error: "Consent required", status: 400 };
  }

  const peeked = await peekListingClaimInviteToken(prisma, input.rawToken);
  if (!peeked.ok) {
    return { ok: false, error: "Invitation unavailable", status: 400 };
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: input.listingSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      claimStatus: true,
      claimedVenueId: true,
      verificationStatus: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      formattedAddress: true,
      city: true,
      region: true,
      country: true,
      lat: true,
      lng: true,
      timeZone: true,
      facebookUrl: true,
      instagramUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
      about: true,
      growthLead: {
        select: {
          contactEmailConfidence: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
        },
      },
      schedules: { where: { isActive: true } },
      claimRequests: {
        where: { status: "PENDING" },
        select: { id: true, email: true },
      },
    },
  });
  if (!listing || listing.id !== peeked.listingId) {
    return { ok: false, error: "Listing mismatch", status: 400 };
  }

  const conflicting = listing.claimRequests.some(
    (c) => c.email.toLowerCase() !== loginEmail && c.email.toLowerCase() !== peeked.intendedEmailNormalized,
  );

  let placeAlreadyOnAnotherVenue = false;
  if (listing.googlePlaceId) {
    const existingVenue = await prisma.venue.findUnique({
      where: { googlePlaceId: listing.googlePlaceId },
      select: { id: true },
    });
    placeAlreadyOnAnotherVenue = Boolean(existingVenue);
  }

  const suppressed = await isMarketingEmailSuppressed(prisma, loginEmail);
  const geoConflict = listingHasGeoConflict({
    region: listing.region,
    city: listing.city,
    formattedAddress: listing.formattedAddress,
    name: listing.name,
    discoveryMarketSlug: listing.growthLead?.discoveryMarketSlug,
  });

  const eligibility = evaluateInstantClaimAutoApproval({
    verificationStatus: listing.verificationStatus,
    claimStatus: listing.claimStatus,
    claimedVenueId: listing.claimedVenueId,
    hasConflictingActiveClaim: conflicting,
    tokenValid: true,
    intendedEmailNormalized: peeked.intendedEmailNormalized,
    loginEmailNormalized: loginEmail,
    contactConfidence: listing.growthLead?.contactEmailConfidence,
    websiteUrl: listing.websiteUrl ?? listing.growthLead?.websiteUrl,
    sourceUrl: listing.sourceUrl,
    googlePlaceId: listing.googlePlaceId,
    placeAlreadyOnAnotherVenue,
    authorityConfirmed: input.authorityConfirmed,
    termsAccepted: input.termsAccepted,
    privacyAccepted: input.privacyAccepted,
    role: input.role,
    geoConflict,
    emailSuppressed: suppressed.suppressed,
  });

  if (!eligibility.autoApprove) {
    try {
      const claimRequest = await prisma.$transaction(async (tx) => {
        // Manual review may use a different login email than the invite; do not
        // require recipient match on consume (auto-approve path still enforces it).
        const consumed = await consumeListingClaimInviteToken(tx as unknown as PrismaClient, {
          rawToken: input.rawToken,
          listingId: listing.id,
          markUsed: true,
        });
        if (!consumed.ok) {
          throw new Error("invitation_unavailable");
        }

        const cr = await tx.listingClaimRequest.create({
          data: {
            listingId: listing.id,
            contactName: input.contactName.trim().slice(0, 200),
            role: input.role,
            email: loginEmail,
            desiredLoginEmail: loginEmail,
            authorityConfirmedAt: new Date(),
            termsAcceptedAt: new Date(),
            privacyAcceptedAt: new Date(),
            decision: "MANUAL_REVIEW",
            decisionReason: eligibility.reason,
            claimInviteTokenId: consumed.tokenId,
            status: "PENDING",
          },
        });
        await tx.publicOpenMicListing.update({
          where: { id: listing.id },
          data: { claimStatus: "CLAIM_PENDING" },
          select: { id: true },
        });
        await tx.listingClaimAuditEvent.create({
          data: {
            listingId: listing.id,
            eventType: "CLAIM_SUBMITTED_MANUAL_REVIEW",
            meta: { reason: eligibility.reason, claimRequestId: cr.id },
          },
        });
        return cr;
      });

      return {
        ok: true,
        decision: "MANUAL_REVIEW",
        claimRequestId: claimRequest.id,
        reason: eligibility.reason,
      };
    } catch {
      return { ok: false, error: "Could not submit claim", status: 409 };
    }
  }

  // AUTO_APPROVE path — single transaction with row lock
  let createdOwner = false;
  let result: {
    venueId: string;
    venueSlug: string;
    ownerId: string;
    listingId: string;
    createdOwner: boolean;
  };
  try {
    result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT id FROM "PublicOpenMicListing" WHERE id = $1 FOR UPDATE`,
      listing.id,
    );

    const locked = await tx.publicOpenMicListing.findUnique({
      where: { id: listing.id },
      include: {
        schedules: { where: { isActive: true } },
        growthLead: { select: { contactEmailConfidence: true, websiteUrl: true } },
      },
    });
    if (!locked || locked.claimedVenueId || locked.claimStatus === "CLAIMED") {
      throw new Error("listing_no_longer_claimable");
    }
    if (locked.verificationStatus !== "VERIFIED") {
      throw new Error("listing_not_verified");
    }

    const consumed = await consumeListingClaimInviteToken(tx as unknown as PrismaClient, {
      rawToken: input.rawToken,
      listingId: locked.id,
      loginEmailNormalized: loginEmail,
      markUsed: true,
    });
    if (!consumed.ok) {
      throw new Error("invitation_unavailable");
    }

    let owner = await tx.venueOwner.findUnique({ where: { email: loginEmail } });
    if (!owner) {
      const randomSecret = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(`${UNUSABLE_PASSWORD_PREFIX}${randomSecret}`, 10);
      owner = await tx.venueOwner.create({
        data: {
          email: loginEmail,
          passwordHash,
          registrationContentConsentAt: new Date(),
          registrationContentConsentVersion: REGISTRATION_CONTENT_CONSENT_VERSION,
        },
      });
      createdOwner = true;
    }

    let venue =
      locked.googlePlaceId
        ? await tx.venue.findUnique({ where: { googlePlaceId: locked.googlePlaceId } })
        : null;

    if (venue && venue.ownerId !== owner.id) {
      throw new Error("place_owned_by_other");
    }

    if (!venue) {
      const slug = await uniqueVenueSlug(tx as unknown as PrismaClient, locked.name);
      if (!locked.googlePlaceId) {
        throw new Error("missing_google_place");
      }
      venue = await tx.venue.create({
        data: {
          ownerId: owner.id,
          name: locked.name,
          slug,
          googlePlaceId: locked.googlePlaceId,
          formattedAddress: locked.formattedAddress,
          city: locked.city,
          region: locked.region,
          country: locked.country,
          lat: locked.lat,
          lng: locked.lng,
          timeZone: locked.timeZone || "America/Chicago",
          websiteUrl: locked.websiteUrl,
          facebookUrl: locked.facebookUrl,
          instagramUrl: locked.instagramUrl,
          tiktokUrl: locked.tiktokUrl,
          youtubeUrl: locked.youtubeUrl,
          about: locked.about,
          // Booking stays disabled until owner explicitly enables on activation page.
          bookingRestrictionMode: "NONE",
        },
      });
    }

    // Import schedules as draft EventTemplates — not public, not bookable.
    for (const sched of locked.schedules) {
      const existing = await tx.eventTemplate.findFirst({
        where: {
          venueId: venue.id,
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
          venueId: venue.id,
          title: sched.title || locked.name,
          description: sched.description,
          weekday: sched.weekday,
          startTimeMin: sched.startTimeMin,
          endTimeMin: sched.endTimeMin,
          timeZone: sched.timeZone || locked.timeZone || "America/Chicago",
          slotMinutes: Math.min(60, Math.max(5, duration)),
          breakMinutes: 0,
          isPublic: false,
          performanceFormat: sched.performanceFormat,
          bookingRestrictionMode: "NONE",
        },
      });
    }

    const claimRequest = await tx.listingClaimRequest.create({
      data: {
        listingId: locked.id,
        contactName: input.contactName.trim().slice(0, 200),
        role: input.role,
        email: loginEmail,
        desiredLoginEmail: loginEmail,
        authorityConfirmedAt: new Date(),
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        decision: "AUTO_APPROVED",
        decisionReason: "official_domain_instant_claim",
        claimInviteTokenId: consumed.tokenId,
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByEmail: "system:instant-claim",
        reviewNotes: "Auto-approved official-domain claim",
      },
    });

    await tx.publicOpenMicListing.update({
      where: { id: locked.id },
      data: {
        claimedVenueId: venue.id,
        claimStatus: "CLAIMED",
      },
      select: { id: true },
    });

    await tx.listingClaimAuditEvent.create({
      data: {
        listingId: locked.id,
        eventType: "CLAIM_AUTO_APPROVED",
        meta: {
          venueId: venue.id,
          ownerId: owner.id,
          createdOwner,
          claimRequestId: claimRequest.id,
          schedulesImported: locked.schedules.length,
          bookingEnabled: false,
        },
      },
    });

    return {
      venueId: venue.id,
      venueSlug: venue.slug,
      ownerId: owner.id,
      listingId: locked.id,
      createdOwner,
    };
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "claim_failed";
    if (
      msg === "listing_no_longer_claimable" ||
      msg === "invitation_unavailable" ||
      msg === "place_owned_by_other" ||
      msg === "missing_google_place" ||
      msg === "listing_not_verified"
    ) {
      return { ok: false, error: "Could not complete claim", status: 409 };
    }
    console.error("[instantClaim] auto_approve_failed", msg);
    return { ok: false, error: "Could not complete claim", status: 500 };
  }

  // Password setup only for newly created owners — never force reset existing passwords.
  let passwordSetupSent = false;
  if (result.createdOwner) {
    try {
      const sent = await createPasswordReset({ accountType: "VENUE", email: loginEmail });
      passwordSetupSent = sent.sent;
    } catch (e) {
      console.error("[instantClaim] password setup email failed", {
        domain: loginEmail.split("@")[1],
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await prisma.listingClaimAuditEvent.create({
      data: {
        listingId: result.listingId,
        eventType: "CLAIM_PASSWORD_SETUP_EMAIL",
        meta: { sent: passwordSetupSent },
      },
    });
  }

  return {
    ok: true,
    decision: "AUTO_APPROVED",
    venueId: result.venueId,
    venueSlug: result.venueSlug,
    ownerId: result.ownerId,
    listingId: result.listingId,
    passwordSetupSent,
    activationPath: `/claim/activate/${result.venueSlug}`,
  };
}
