/**
 * Read-only status for the two approved claim-invite canaries.
 * Redacts recipient addresses; never prints raw tokens.
 *
 *   npx tsx scripts/monitor-claim-canary.mjs
 */
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

const SLUGS = [
  "game-of-jokes-open-mic-competition-west-leigh-street-richmond",
  "monday-night-poetry-open-mic-hosted-by-keeping-it-p",
];

function redactEmail(email) {
  const n = String(email || "").toLowerCase().trim();
  const at = n.indexOf("@");
  if (at < 1) return null;
  const local = n.slice(0, at);
  const domain = n.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain.slice(0, 2)}***${domain.slice(domain.lastIndexOf("."))}`;
}

function emailDomain(email) {
  const at = String(email || "").lastIndexOf("@");
  return at > 0 ? String(email).slice(at + 1).toLowerCase() : null;
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../src/generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { isMarketingEmailSuppressed } = await import("../src/lib/marketing/suppression.ts");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const rows = [];
for (const slug of SLUGS) {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      claimStatus: true,
      verificationStatus: true,
      claimedVenueId: true,
      claimInviteEmailSentAt: true,
      claimInviteEmail: true,
      claimInviteProviderMessageId: true,
      growthLead: { select: { contactEmailNormalized: true, contactEmailConfidence: true } },
    },
  });
  if (!listing) {
    rows.push({ slug, found: false });
    continue;
  }

  const email = listing.claimInviteEmail || listing.growthLead?.contactEmailNormalized;
  const suppressed = email ? await isMarketingEmailSuppressed(prisma, email) : { suppressed: false };
  const tokens = await prisma.listingClaimInviteToken.findMany({
    where: { listingId: listing.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      createdAt: true,
      intendedEmailNormalized: true,
    },
  });
  const audits = await prisma.listingClaimAuditEvent.findMany({
    where: { listingId: listing.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, eventType: true, createdAt: true, meta: true },
  });
  const claims = await prisma.listingClaimRequest.findMany({
    where: { listingId: listing.id },
    select: { id: true, status: true, createdAt: true },
  });

  let venue = null;
  let ownerLinked = false;
  let schedulePublished = false;
  let bookingEnabled = false;
  if (listing.claimedVenueId) {
    venue = await prisma.venue.findUnique({
      where: { id: listing.claimedVenueId },
      select: { id: true, slug: true, ownerId: true },
    });
    ownerLinked = Boolean(venue?.ownerId);
    schedulePublished =
      (await prisma.eventTemplate.count({
        where: { venueId: listing.claimedVenueId, isPublic: true },
      })) > 0;
    bookingEnabled =
      (await prisma.eventTemplate.count({
        where: {
          venueId: listing.claimedVenueId,
          OR: [{ bookingMode: { not: "NONE" } }, { isPublic: true }],
        },
      })) > 0;
  }

  const latestToken = tokens[0] ?? null;
    const sentAudit = audits.find((a) => a.eventType === "CLAIM_INVITE_SENT");
  const opened = audits.some((a) => a.eventType === "CLAIM_INVITE_OPENED");
  const submitted = audits.some((a) => String(a.eventType).includes("CLAIM_SUBMITTED"));
  const autoApproved = audits.some((a) => a.eventType === "CLAIM_AUTO_APPROVED");
  const activationReached = audits.some((a) =>
    /ACTIVATION|PASSWORD_SETUP|CLAIM_AUTO_APPROVED/i.test(String(a.eventType)),
  );

  const lastActivity = [
    listing.claimInviteEmailSentAt,
    latestToken?.usedAt,
    latestToken?.createdAt,
    audits[0]?.createdAt,
    claims[0]?.createdAt,
  ]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .sort((a, b) => b - a)[0];

  rows.push({
    found: true,
    listingId: listing.id,
    listingSlug: listing.slug,
    listingName: listing.name,
    verificationStatus: listing.verificationStatus,
    claimStatus: listing.claimStatus,
    recipientRedacted: email ? redactEmail(email) : null,
    recipientDomain: email ? emailDomain(email) : null,
    confidence: listing.growthLead?.contactEmailConfidence ?? null,
    providerAccepted: Boolean(listing.claimInviteProviderMessageId),
    providerMessageId: listing.claimInviteProviderMessageId,
    claimInviteEmailSentAt: listing.claimInviteEmailSentAt,
    delivery: "unknown_no_webhook",
    bounce: suppressed.reason === "HARD_BOUNCE" ? true : false,
    complaint: suppressed.reason === "COMPLAINT" ? true : false,
    suppression: suppressed,
    token: latestToken
      ? {
          id: latestToken.id,
          status: latestToken.status,
          expiresAt: latestToken.expiresAt,
          usedAt: latestToken.usedAt,
          revokedAt: latestToken.revokedAt,
          intendedRedacted: redactEmail(latestToken.intendedEmailNormalized),
        }
      : null,
    tokenCounts: {
      total: tokens.length,
      active: tokens.filter((t) => t.status === "ACTIVE").length,
      used: tokens.filter((t) => t.status === "USED").length,
      revoked: tokens.filter((t) => t.status === "REVOKED").length,
      expired: tokens.filter((t) => t.status === "EXPIRED").length,
    },
      claimPageOpened: opened,
      claimStarted: submitted || claims.length > 0,
    claimSubmitted: submitted || claims.some((c) => c.status !== "REJECTED"),
    autoApproved,
    manualReview: claims.some((c) => c.status === "PENDING"),
    venueOwnerLinked: ownerLinked,
    venueLinked: Boolean(venue),
    activationPageReached: activationReached,
    schedulePublished,
    bookingEnabled,
    lastActivityTimestamp: lastActivity ? new Date(lastActivity).toISOString() : null,
    recentAuditTypes: audits.slice(0, 8).map((a) => ({ type: a.eventType, at: a.createdAt })),
    sentAuditId: sentAudit?.id ?? null,
  });
}

const gates = {
  MICSTAGE_CLAIM_INVITES_ENABLED: process.env.MICSTAGE_CLAIM_INVITES_ENABLED || "(unset)",
  MICSTAGE_CLAIM_INVITES_CANARY_MODE: process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE || "(unset→canary on)",
  LISTING_CLAIM_INVITES_PER_CRON: process.env.LISTING_CLAIM_INVITES_PER_CRON || "(unset)",
};

console.log(
  JSON.stringify(
    {
      ok: true,
      monitoredSlugs: SLUGS,
      localOpsGates: gates,
      canaries: rows,
      totals: {
        providerAccepted: rows.filter((r) => r.providerAccepted).length,
        tokens: rows.reduce((n, r) => n + (r.tokenCounts?.total || 0), 0),
        claimed: rows.filter((r) => r.claimStatus === "CLAIMED").length,
      },
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
