/**
 * Synthetic claim-invite session/security test against production DB + local modules.
 * Does NOT touch Starr Hill / Choose901 canary tokens.
 * Does NOT send email. Invites remain globally OFF.
 *
 *   npx tsx scripts/prod-claim-session-security-test.mjs
 *   npx tsx scripts/prod-claim-session-security-test.mjs --cleanup
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

process.env.RESEND_API_KEY = "";
process.env.MICSTAGE_CLAIM_INVITES_ENABLED = "false";
process.env.LISTING_CLAIM_INVITES_PER_CRON = "0";
process.env.APP_URL = process.env.APP_URL || "https://micstage.com";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../src/generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || /127\.0\.0\.1|55432|localhost/.test(url)) {
  console.error(JSON.stringify({ ok: false, error: "refusing_non_production_url" }));
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const SYN = "micstage-claim-session-test";
  const TEST_EMAIL = "claim-session-test@micstage.com";
  const cleanupOnly = process.argv.includes("--cleanup");

  const CANARY_SLUGS = [
    "game-of-jokes-open-mic-competition-west-leigh-street-richmond",
    "monday-night-poetry-open-mic-hosted-by-keeping-it-p",
  ];

  async function canarySnapshot() {
    const rows = [];
    for (const slug of CANARY_SLUGS) {
      const l = await prisma.publicOpenMicListing.findUnique({
        where: { slug },
        select: {
          id: true,
          claimInviteEmailSentAt: true,
          claimInviteProviderMessageId: true,
          claimStatus: true,
        },
      });
      const tokens = await prisma.listingClaimInviteToken.findMany({
        where: { listingId: l?.id ?? "__none__" },
        select: { id: true, status: true },
      });
      rows.push({
        slug,
        claimStatus: l?.claimStatus,
        inviteSentAt: l?.claimInviteEmailSentAt?.toISOString() ?? null,
        hasProviderId: Boolean(l?.claimInviteProviderMessageId),
        tokens: tokens.map((t) => ({ id: t.id, status: t.status })),
      });
    }
    return rows;
  }

  async function cleanup() {
    const listings = await prisma.publicOpenMicListing.findMany({
      where: { slug: { startsWith: SYN } },
      select: { id: true, claimedVenueId: true, growthLeadId: true },
    });
    for (const l of listings) {
      await prisma.publicOpenMicListing.update({
        where: { id: l.id },
        data: { claimedVenueId: null, claimStatus: "UNCLAIMED" },
      });
    }
    const venueIds = listings.map((l) => l.claimedVenueId).filter(Boolean);
    if (venueIds.length) {
      await prisma.eventTemplate.deleteMany({ where: { venueId: { in: venueIds } } });
      await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    }
    for (const l of listings) {
      await prisma.listingClaimRequest.deleteMany({ where: { listingId: l.id } });
      await prisma.listingClaimInviteToken.deleteMany({ where: { listingId: l.id } });
      await prisma.listingClaimAuditEvent.deleteMany({ where: { listingId: l.id } });
      await prisma.listingOpenMicEvidence.deleteMany({ where: { listingId: l.id } });
      await prisma.publicOpenMicSchedule.deleteMany({ where: { listingId: l.id } });
      await prisma.publicOpenMicListing.delete({ where: { id: l.id } });
    }
    const leadIds = listings.map((l) => l.growthLeadId).filter(Boolean);
    if (leadIds.length) await prisma.growthLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.venueOwner.deleteMany({ where: { email: TEST_EMAIL } });
    console.log(JSON.stringify({ cleanup: true, removed: listings.length }));
  }

  async function main() {
    const beforeCanaries = await canarySnapshot();
    if (cleanupOnly) {
      await cleanup();
      return;
    }

    await cleanup();

    const { issueListingClaimInviteToken, peekListingClaimInviteToken, consumeListingClaimInviteToken } =
      await import("../src/lib/publicListings/claimInviteToken.ts");
    const { submitInstantClaim } = await import("../src/lib/publicListings/instantClaimActivation.ts");
    const { maskClaimInviteEmail, CLAIM_AUTHORITY_AFFIRMATION } = await import(
      "../src/lib/publicListings/claimInviteSession.ts"
    );
    const { buildListingClaimInvitePayload } = await import(
      "../src/lib/publicListings/listingClaimInviteEmail.ts"
    );

    const placeId = `ChIJ_MICSTAGE_SESSION_${crypto.randomBytes(4).toString("hex")}`;
    const slug = `${SYN}-${crypto.randomBytes(3).toString("hex")}`;
    const lead = await prisma.growthLead.create({
      data: {
        leadType: "VENUE",
        name: `${SYN} venue`,
        city: "Chicago",
        region: "IL",
        websiteUrl: "https://micstage.com",
        contactEmailNormalized: TEST_EMAIL,
        contactEmailConfidence: "HIGH",
        openMicSignalTier: "EXPLICIT_OPEN_MIC",
        discoveryMarketSlug: "chicagoland",
        sourceKind: "MANUAL_ADMIN",
        status: "APPROVED",
        internalNotes: "SYNTHETIC_CLAIM_SESSION_TEST — exclude from public/discovery outreach",
      },
    });
    const listing = await prisma.publicOpenMicListing.create({
      data: {
        name: "MicStage Claim Session Synthetic Open Mic",
        slug,
        formattedAddress: "1 Test St, Chicago, IL",
        city: "Chicago",
        region: "IL",
        country: "US",
        websiteUrl: "https://micstage.com",
        googlePlaceId: placeId,
        googlePlaceVerifiedAt: new Date(),
        verificationStatus: "VERIFIED",
        claimStatus: "UNCLAIMED",
        growthLeadId: lead.id,
        sourceUrl: "https://micstage.com",
        about: "Synthetic open mic for claim session security tests.",
        internalNotes: "SYNTHETIC_CLAIM_SESSION_TEST",
      },
    });

    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: TEST_EMAIL,
    });
    const rawToken = issued.rawToken;

    const peeked = await peekListingClaimInviteToken(prisma, rawToken);
    if (!peeked.ok) throw new Error("peek_failed");

    // Opening does not consume
    const stillActive = await prisma.listingClaimInviteToken.findUnique({
      where: { id: issued.tokenId },
      select: { status: true },
    });

    await prisma.listingClaimAuditEvent.create({
      data: {
        listingId: listing.id,
        eventType: "CLAIM_INVITE_OPENED",
        meta: { tokenId: issued.tokenId, synthetic: true },
      },
    });

    const ownersBefore = await prisma.venueOwner.count();
    const masked = maskClaimInviteEmail(TEST_EMAIL);
    const payload = buildListingClaimInvitePayload({
      listingName: listing.name,
      listingSlug: listing.slug,
      city: listing.city,
      region: listing.region,
      claimUrl: "[SECURE CLAIM LINK]",
    });

    // Block auto-approve without authority
    const noAuth = await submitInstantClaim(prisma, {
      tokenId: issued.tokenId,
      listingSlug: listing.slug,
      contactName: "Tester",
      role: "owner",
      loginEmail: TEST_EMAIL,
      authorityConfirmed: false,
      termsAccepted: true,
      privacyAccepted: true,
      sessionIntendedEmailNormalized: TEST_EMAIL,
    });

    const noTerms = await submitInstantClaim(prisma, {
      tokenId: issued.tokenId,
      listingSlug: listing.slug,
      contactName: "Tester",
      role: "owner",
      loginEmail: TEST_EMAIL,
      authorityConfirmed: true,
      termsAccepted: false,
      privacyAccepted: true,
      sessionIntendedEmailNormalized: TEST_EMAIL,
    });

    // Valid submission
    const ok = await submitInstantClaim(prisma, {
      tokenId: issued.tokenId,
      listingSlug: listing.slug,
      contactName: "Tester",
      role: "owner",
      loginEmail: TEST_EMAIL,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
      sessionIntendedEmailNormalized: TEST_EMAIL,
    });

    const reuse = await consumeListingClaimInviteToken(prisma, {
      rawToken,
      markUsed: true,
    });

    const templates = ok.ok && ok.decision === "AUTO_APPROVED"
      ? await prisma.eventTemplate.findMany({
          where: { venueId: ok.venueId },
          select: { isPublic: true, bookingRestrictionMode: true },
        })
      : [];

    const ownersAfter = await prisma.venueOwner.count();
    const afterCanaries = await canarySnapshot();

    const report = {
      ok: true,
      peekOk: peeked.ok,
      tokenStillActiveAfterPeek: stillActive?.status === "ACTIVE",
      authorityAffirmationIncludesRequiredText: /owner, manager, authorized employee/i.test(
        CLAIM_AUTHORITY_AFFIRMATION,
      ),
      emailMasked: masked,
      fullEmailNotEqualMasked: masked !== TEST_EMAIL,
      subject: payload.subject,
      noAuthBlocked: !noAuth.ok && noAuth.error === "Consent required",
      noTermsBlocked: !noTerms.ok && noTerms.error === "Consent required",
      submitOk: ok.ok,
      decision: ok.ok ? ok.decision : null,
      reuseFails: !reuse.ok,
      bookingDisabled: templates.every(
        (t) => t.isPublic === false || t.bookingRestrictionMode === "NONE",
      ),
      ownersDelta: ownersAfter - ownersBefore,
      canariesUnchanged: JSON.stringify(beforeCanaries) === JSON.stringify(afterCanaries),
      beforeCanaries,
      afterCanaries,
    };

    console.log(JSON.stringify(report, null, 2));

    // Wipe synthetic raw token from memory path
    issued.rawToken = "[REDACTED]";
    await cleanup();
    process.exitCode = report.ok &&
      report.noAuthBlocked &&
      report.noTermsBlocked &&
      report.submitOk &&
      report.reuseFails &&
      report.canariesUnchanged
      ? 0
      : 1;
  }

  main()
    .catch((e) => {
      console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
