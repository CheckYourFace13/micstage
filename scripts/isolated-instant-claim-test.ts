/**
 * Isolated DB instant-claim verification (no production, no real email).
 * Usage:
 *   $env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/micstage_isolated_restore'
 *   $env:RESEND_API_KEY=''
 *   $env:NODE_ENV='development'
 *   $env:MICSTAGE_CLAIM_INVITES_ENABLED='false'
 *   npx tsx scripts/isolated-instant-claim-test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { issueListingClaimInviteToken } from "../src/lib/publicListings/claimInviteToken";
import { submitInstantClaim } from "../src/lib/publicListings/instantClaimActivation";
import { peekListingClaimInviteToken } from "../src/lib/publicListings/claimInviteToken";

const ISOLATED_URL =
  process.env.ISOLATED_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres@127.0.0.1:55432/micstage_isolated_restore";

process.env.DATABASE_URL = ISOLATED_URL;
process.env.DIRECT_URL = ISOLATED_URL;
delete process.env.RESEND_API_KEY;
(process.env as { NODE_ENV?: string }).NODE_ENV = "development";
process.env.MICSTAGE_CLAIM_INVITES_ENABLED = "false";
process.env.LISTING_CLAIM_INVITES_PER_CRON = "0";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: ISOLATED_URL }),
});

const SYN_PREFIX = "micstage-internal-claim-test";
const TEST_EMAIL = "internal-claim-test@micstage.com";
const TEST_PLACE = `ChIJ_INTERNAL_CLAIM_TEST_${crypto.randomBytes(4).toString("hex")}`;

async function fingerprintOwners() {
  const rows = await prisma.venueOwner.findMany({
    select: { id: true, email: true, passwordHash: true },
    orderBy: { id: "asc" },
  });
  return {
    count: rows.length,
    fingerprint: crypto.createHash("md5").update(rows.map((r) => r.passwordHash).join(",")).digest("hex"),
    emails: rows.map((r) => r.email),
  };
}

async function cleanupSynthetic() {
  const listings = await prisma.publicOpenMicListing.findMany({
    where: { slug: { startsWith: SYN_PREFIX } },
    select: { id: true, claimedVenueId: true, growthLeadId: true },
  });
  const venueIds = listings.map((l) => l.claimedVenueId).filter((id): id is string => Boolean(id));
  const leadIds = listings.map((l) => l.growthLeadId).filter((id): id is string => Boolean(id));

  for (const l of listings) {
    await prisma.publicOpenMicListing.update({
      where: { id: l.id },
      data: { claimedVenueId: null, claimStatus: "UNCLAIMED" },
    });
  }
  if (venueIds.length) {
    await prisma.eventTemplate.deleteMany({ where: { venueId: { in: venueIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
  }
  await prisma.venue.deleteMany({
    where: {
      OR: [
        { slug: { startsWith: SYN_PREFIX } },
        { googlePlaceId: { startsWith: "ChIJ_INTERNAL_CLAIM_TEST_" } },
      ],
    },
  });

  for (const l of listings) {
    await prisma.listingClaimRequest.deleteMany({ where: { listingId: l.id } });
    await prisma.listingClaimInviteToken.deleteMany({ where: { listingId: l.id } });
    await prisma.listingClaimAuditEvent.deleteMany({ where: { listingId: l.id } });
    await prisma.listingOpenMicEvidence.deleteMany({ where: { listingId: l.id } });
    await prisma.publicOpenMicSchedule.deleteMany({ where: { listingId: l.id } });
    await prisma.publicOpenMicListing.delete({ where: { id: l.id } });
  }
  if (leadIds.length) {
    await prisma.growthLead.deleteMany({ where: { id: { in: leadIds } } });
  }
  await prisma.growthLead.deleteMany({ where: { name: { startsWith: SYN_PREFIX } } });
  await prisma.venueOwner.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.venueOwner.deleteMany({ where: { email: "internal.tester@gmail.com" } });
  await prisma.venueOwner.deleteMany({
    where: { email: { startsWith: "other-" }, venues: { none: {} } },
  });
}

async function seedListing(opts?: { confidence?: "HIGH" | "MEDIUM"; website?: string; email?: string }) {
  const slug = `${SYN_PREFIX}-${crypto.randomBytes(3).toString("hex")}`;
  const email = (opts?.email ?? TEST_EMAIL).toLowerCase();
  const website = opts?.website ?? "https://micstage.com";
  const lead = await prisma.growthLead.create({
    data: {
      leadType: "VENUE",
      name: `${SYN_PREFIX} venue`,
      city: "Chicago",
      region: "IL",
      websiteUrl: website,
      contactEmailNormalized: email,
      contactEmailConfidence: opts?.confidence ?? "HIGH",
      discoveryMarketSlug: "chicagoland",
      sourceKind: "MANUAL_ADMIN",
      status: "APPROVED",
    },
  });
  const listing = await prisma.publicOpenMicListing.create({
    data: {
      growthLeadId: lead.id,
      slug,
      name: `${SYN_PREFIX} Open Mic`,
      formattedAddress: "123 Test St, Chicago, IL 60601",
      city: "Chicago",
      region: "IL",
      country: "US",
      lat: 41.88,
      lng: -87.63,
      timeZone: "America/Chicago",
      websiteUrl: website,
      googlePlaceId: `${TEST_PLACE}_${slug.slice(-6)}`,
      googlePlaceVerifiedAt: new Date(),
      verificationStatus: "VERIFIED",
      claimStatus: "UNCLAIMED",
      sourceUrl: website,
      schedules: {
        create: [
          {
            weekday: "TUE",
            startTimeMin: 19 * 60,
            endTimeMin: 22 * 60,
            timeZone: "America/Chicago",
            title: "Weekly open mic",
            isActive: true,
          },
        ],
      },
    },
    include: { schedules: true },
  });
  return { lead, listing, email };
}

async function main() {
  const results: Record<string, unknown> = {};
  const preOwners = await fingerprintOwners();
  results.preOwnerFingerprint = preOwners.fingerprint;
  results.preOwnerCount = preOwners.count;

  await cleanupSynthetic();

  // --- valid automatic claim ---
  {
    const { listing, email } = await seedListing();
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    assert.equal(issued.rawToken.length, 64);
    assert.ok(!issued.rawToken.includes(issued.tokenId));

    const ok = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Internal Tester",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(ok.ok, true);
    if (ok.ok && ok.decision === "AUTO_APPROVED") {
      assert.ok(ok.venueId);
      assert.ok(ok.activationPath?.startsWith("/claim/activate/"));
      const templates = await prisma.eventTemplate.findMany({ where: { venueId: ok.venueId } });
      assert.ok(templates.length >= 1);
      assert.ok(templates.every((t) => t.isPublic === false));
      assert.ok(templates.every((t) => t.bookingRestrictionMode === "NONE"));
      const venue = await prisma.venue.findUnique({ where: { id: ok.venueId } });
      assert.equal(venue?.bookingRestrictionMode, "NONE");
      const listingAfter = await prisma.publicOpenMicListing.findUnique({ where: { id: listing.id } });
      assert.equal(listingAfter?.claimStatus, "CLAIMED");
      assert.equal(listingAfter?.claimedVenueId, ok.venueId);
      results.validAutoClaim = {
        ok: true,
        bookingDisabled: true,
        schedulesImported: templates.length,
        passwordSetupSent: ok.passwordSetupSent,
      };
    } else {
      throw new Error(`expected AUTO_APPROVED got ${JSON.stringify(ok)}`);
    }

    // reused token
    const reuse = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Internal Tester",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(reuse.ok, false);
    results.reusedToken = { ok: false, error: reuse.ok ? null : reuse.error };
  }

  // --- invalid token ---
  {
    const { listing, email } = await seedListing();
    const bad = await submitInstantClaim(prisma, {
      rawToken: "a".repeat(64),
      listingSlug: listing.slug,
      contactName: "X",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(bad.ok, false);
    results.invalidToken = { ok: false };
  }

  // --- expired token ---
  {
    const { listing, email } = await seedListing();
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await peekListingClaimInviteToken(prisma, issued.rawToken);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "expired");
    results.expiredToken = { ok: false, reason: "expired" };
  }

  // --- free-mail manual path ---
  {
    const freeEmail = "internal.tester@gmail.com";
    const { listing } = await seedListing({
      email: freeEmail,
      website: "https://micstage.com",
      confidence: "HIGH",
    });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: freeEmail,
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Free Mail",
      role: "owner",
      loginEmail: freeEmail,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.decision, "MANUAL_REVIEW");
      assert.equal(res.reason, "free_mail");
    }
    const owners = await prisma.venueOwner.findMany({ where: { email: freeEmail } });
    assert.equal(owners.length, 0);
    results.freeMailManual = { decision: "MANUAL_REVIEW", noOwnerCreated: true };
  }

  // --- changed login email → manual ---
  {
    const { listing, email } = await seedListing({ website: "https://micstage.com" });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Changed Email",
      role: "owner",
      loginEmail: "other-internal@micstage.com",
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.decision, "MANUAL_REVIEW");
      assert.equal(res.reason, "login_email_changed");
    }
    results.changedLoginEmailManual = { decision: "MANUAL_REVIEW" };
    await prisma.venueOwner.deleteMany({ where: { email: "other-internal@micstage.com" } });
  }

  // --- revoked token ---
  {
    const { listing, email } = await seedListing({ website: "https://micstage.com" });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Revoked",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, false);
    results.revokedToken = { ok: false };
  }

  // --- domain mismatch manual ---
  {
    const { listing, email } = await seedListing({
      website: "https://other-venue-domain.example",
      email: TEST_EMAIL,
    });
    // email is @micstage.com but website is other domain
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Mismatch",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.decision, "MANUAL_REVIEW");
      assert.equal(res.reason, "domain_mismatch");
    }
    results.domainMismatchManual = { decision: "MANUAL_REVIEW" };
  }

  // --- existing VenueOwner reuse (preserve password) ---
  {
    const existingHash = await bcryptHash("existing-secret-never-emailed");
    const owner = await prisma.venueOwner.upsert({
      where: { email: TEST_EMAIL },
      create: {
        email: TEST_EMAIL,
        passwordHash: existingHash,
        registrationContentConsentAt: new Date(),
        registrationContentConsentVersion: "v1",
      },
      update: { passwordHash: existingHash },
    });
    const { listing } = await seedListing({ email: TEST_EMAIL, website: "https://micstage.com" });
    // unique place id already set
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: TEST_EMAIL,
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Reuse Owner",
      role: "owner",
      loginEmail: TEST_EMAIL,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, true);
    if (res.ok && res.decision === "AUTO_APPROVED") {
      assert.equal(res.ownerId, owner.id);
      assert.equal(res.passwordSetupSent, false);
      const after = await prisma.venueOwner.findUnique({ where: { id: owner.id } });
      assert.equal(after?.passwordHash, existingHash);
      results.existingOwnerReuse = { ok: true, passwordPreserved: true, passwordSetupSent: false };
    } else {
      throw new Error(`owner reuse failed: ${JSON.stringify(res)}`);
    }
  }

  // --- duplicate Venue prevention (place already on another venue) ---
  {
    const placeId = `ChIJ_INTERNAL_CLAIM_TEST_DUP_${crypto.randomBytes(3).toString("hex")}`;
    const otherOwner = await prisma.venueOwner.create({
      data: {
        email: `other-${crypto.randomBytes(2).toString("hex")}@micstage.com`,
        passwordHash: await bcryptHash("x"),
        registrationContentConsentAt: new Date(),
        registrationContentConsentVersion: "v1",
      },
    });
    const otherVenue = await prisma.venue.create({
      data: {
        ownerId: otherOwner.id,
        name: "Other venue",
        slug: `${SYN_PREFIX}-other-${crypto.randomBytes(2).toString("hex")}`,
        googlePlaceId: placeId,
        formattedAddress: "1 Other St, Chicago, IL",
        city: "Chicago",
        region: "IL",
        country: "US",
        lat: 41.9,
        lng: -87.6,
        timeZone: "America/Chicago",
        bookingRestrictionMode: "NONE",
      },
    });
    const { listing, email } = await seedListing({ website: "https://micstage.com" });
    await prisma.publicOpenMicListing.update({
      where: { id: listing.id },
      data: { googlePlaceId: placeId },
    });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Dup Place",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.decision, "MANUAL_REVIEW");
      assert.equal(res.reason, "place_already_on_venue");
    }
    // cleanup other venue/owner
    await prisma.venue.delete({ where: { id: otherVenue.id } });
    await prisma.venueOwner.delete({ where: { id: otherOwner.id } });
    results.duplicateVenuePrevention = { decision: "MANUAL_REVIEW" };
  }

  // --- concurrent claim attempt ---
  {
    const { listing, email } = await seedListing({ website: "https://micstage.com" });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    const payload = {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Race",
      role: "owner" as const,
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    };
    const [a, b] = await Promise.all([submitInstantClaim(prisma, payload), submitInstantClaim(prisma, payload)]);
    const successes = [a, b].filter((r) => r.ok && "decision" in r && r.decision === "AUTO_APPROVED");
    const failures = [a, b].filter((r) => !r.ok || ("decision" in r && r.decision !== "AUTO_APPROVED"));
    assert.equal(successes.length, 1);
    assert.ok(failures.length >= 1);
    const listingAfter = await prisma.publicOpenMicListing.findUnique({ where: { id: listing.id } });
    assert.ok(listingAfter?.claimedVenueId);
    const venueCount = await prisma.venue.count({
      where: { googlePlaceId: listing.googlePlaceId! },
    });
    assert.equal(venueCount, 1);
    results.concurrency = {
      autoApproved: successes.length,
      otherOutcomes: failures.length,
      singleVenue: venueCount === 1,
    };
  }

  // --- failed transaction rollback: missing consent should not consume? Actually consent fails before consume on auto path via eligibility → manual with consume.
  // Token consume on failed auto mid-tx: force missing google place after peek
  {
    const { listing, email } = await seedListing({ website: "https://micstage.com" });
    const issued = await issueListingClaimInviteToken(prisma, {
      listingId: listing.id,
      intendedEmailNormalized: email,
    });
    await prisma.publicOpenMicListing.update({
      where: { id: listing.id },
      data: { googlePlaceId: null },
    });
    const res = await submitInstantClaim(prisma, {
      rawToken: issued.rawToken,
      listingSlug: listing.slug,
      contactName: "Rollback",
      role: "owner",
      loginEmail: email,
      authorityConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    // eligibility catches missing_google_place → MANUAL_REVIEW and may consume
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.decision, "MANUAL_REVIEW");
    const listingAfter = await prisma.publicOpenMicListing.findUnique({ where: { id: listing.id } });
    assert.equal(listingAfter?.claimedVenueId, null);
    assert.notEqual(listingAfter?.claimStatus, "CLAIMED");
    results.failedAutoRollback = { claimed: false, decision: "MANUAL_REVIEW" };
  }

  // Audit events exist for synthetic listings
  {
    const audits = await prisma.listingClaimAuditEvent.count({
      where: { listing: { slug: { startsWith: SYN_PREFIX } } },
    });
    results.auditEvents = audits;
    assert.ok(audits > 0);
  }

  await cleanupSynthetic();

  const postOwners = await fingerprintOwners();
  results.postOwnerFingerprint = postOwners.fingerprint;
  results.postOwnerCount = postOwners.count;
  results.existingAccountIntegrity =
    preOwners.fingerprint === postOwners.fingerprint && preOwners.count === postOwners.count;

  assert.equal(results.existingAccountIntegrity, true);

  console.log(JSON.stringify({ ok: true, results }, null, 2));
  await prisma.$disconnect();
}

async function bcryptHash(plain: string) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plain, 10);
}

main().catch(async (e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined }));
  try {
    await cleanupSynthetic();
  } catch {
    /* ignore */
  }
  await prisma.$disconnect();
  process.exit(1);
});
