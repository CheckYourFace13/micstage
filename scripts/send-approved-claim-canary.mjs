/**
 * Narrowly scoped real-recipient claim-invite canary.
 *
 * Does NOT enable Hostinger cron sending. Temporarily enables invite sending
 * only inside this process after hard allowlist + eligibility checks.
 *
 * Usage (do not put real emails in git):
 *   npx tsx scripts/send-approved-claim-canary.mjs \
 *     --listing-slug="<approved-slug>" \
 *     --expected-recipient="<approved-email>" \
 *     --expected-domain="<official-domain>" \
 *     --preview
 *
 *   npx tsx scripts/send-approved-claim-canary.mjs \
 *     --listing-slug="<approved-slug>" \
 *     --expected-recipient="<approved-email>" \
 *     --expected-domain="<official-domain>" \
 *     --confirm-real-canary-send
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

/** Hard allowlist: slug → expected official domain(s). No recipient emails stored here. */
const APPROVED_CANARY_SLUGS = {
  "game-of-jokes-open-mic-competition-west-leigh-street-richmond": {
    label: "Game of Jokes / Starr Hill",
    expectedDomains: ["starrhill.com"],
    nameIncludes: ["Game of Jokes"],
  },
  "monday-night-poetry-open-mic-hosted-by-keeping-it-p": {
    label: "Monday Night Poetry / Choose901",
    expectedDomains: ["choose901.com"],
    nameIncludes: ["Monday Night Poetry"],
  },
};

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
]);

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function redactEmail(email) {
  const n = String(email || "").toLowerCase().trim();
  const at = n.indexOf("@");
  if (at < 1) return "[redacted]";
  const local = n.slice(0, at);
  const domain = n.slice(at + 1);
  const localBit = local.slice(0, 1) + "***";
  const domainBit =
    domain.length <= 4 ? "***" : domain.slice(0, 2) + "***" + domain.slice(domain.lastIndexOf("."));
  return `${localBit}@${domainBit}`;
}

function hostOfUrl(u) {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function emailDomain(email) {
  const at = String(email).lastIndexOf("@");
  if (at < 0) return null;
  return String(email)
    .slice(at + 1)
    .toLowerCase()
    .replace(/^www\./, "");
}

function hostsRelated(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function dbHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "bad";
  }
}

function fail(code, detail) {
  console.error(JSON.stringify({ ok: false, error: code, ...detail }, null, 2));
  process.exit(1);
}

const listingSlug = arg("--listing-slug");
let expectedRecipient = arg("--expected-recipient")?.trim().toLowerCase() ?? null;
const expectedDomain = arg("--expected-domain")?.trim().toLowerCase().replace(/^www\./, "") ?? null;
const expectedName = arg("--expected-name");
const previewOnly = process.argv.includes("--preview");
const confirmSend = process.argv.includes("--confirm-real-canary-send");
const useGrowthLeadEmail = process.argv.includes("--use-growth-lead-email");

if (!listingSlug) fail("missing_listing_slug", {});
if (!expectedDomain) fail("missing_expected_domain", {});
if (!expectedRecipient && !useGrowthLeadEmail) {
  fail("missing_expected_recipient", {
    hint: "Pass --expected-recipient or --use-growth-lead-email with --expected-domain",
  });
}

const allow = APPROVED_CANARY_SLUGS[listingSlug];
if (!allow) {
  fail("slug_not_in_approved_canary_allowlist", {
    listingSlug,
    note: "Only the two approved canary listings may be sent.",
  });
}
if (!allow.expectedDomains.some((d) => hostsRelated(expectedDomain, d))) {
  fail("expected_domain_not_approved_for_slug", {
    listingSlug,
    expectedDomain,
    approvedDomains: allow.expectedDomains,
  });
}
if (expectedRecipient) {
  if (!hostsRelated(emailDomain(expectedRecipient) || "", expectedDomain)) {
    fail("recipient_domain_mismatch", {
      recipientRedacted: redactEmail(expectedRecipient),
      expectedDomain,
    });
  }
  if (FREE_MAIL.has(emailDomain(expectedRecipient) || "")) {
    fail("recipient_is_free_mail", { recipientRedacted: redactEmail(expectedRecipient) });
  }
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || url.includes("127.0.0.1") || url.includes("55432") || url.includes("localhost")) {
  fail("refusing_non_production_database", { host: url ? dbHost(url) : null });
}

if (confirmSend && !process.env.RESEND_API_KEY?.trim()) {
  fail("resend_api_key_missing", {
    note: "Add RESEND_API_KEY to local ops env for this script. Hostinger cron stays untouched.",
  });
}
if (
  confirmSend &&
  (!process.env.EMAIL_FROM?.trim() || !process.env.EMAIL_FROM.toLowerCase().includes("micstage"))
) {
  fail("email_from_missing_or_invalid", {});
}

// Force production public URLs for claim links in this process only.
process.env.APP_URL = process.env.APP_URL?.trim() || "https://micstage.com";
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://micstage.com";
// Keep cron batch at zero even if someone enabled invites in this shell.
process.env.LISTING_CLAIM_INVITES_PER_CRON = "0";
process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE =
  process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE?.trim() || "true";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../src/generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { normalizeMarketingEmail } = await import("../src/lib/marketing/normalizeEmail.ts");
const { isMarketingEmailSuppressed } = await import("../src/lib/marketing/suppression.ts");
const { isClaimInviteEmailEligible } = await import("../src/lib/publicListings/claimInviteEligibility.ts");
const { isFreeMailDomain } = await import("../src/lib/publicListings/claimAutoApproval.ts");
const { buildListingClaimInvitePayload } = await import("../src/lib/publicListings/listingClaimInviteEmail.ts");
const { issueListingClaimInviteToken } = await import("../src/lib/publicListings/claimInviteToken.ts");
const { deliverResendEmail } = await import("../src/lib/mailer.ts");
const { transactionalFromAddress } = await import("../src/lib/marketing/emailConfig.ts");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function fingerprintIds(ids) {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 16);
}

async function snapshotCounts() {
  return {
    tokens: await prisma.listingClaimInviteToken.count(),
    activeTokens: await prisma.listingClaimInviteToken.count({ where: { status: "ACTIVE" } }),
    inviteStamp: await prisma.publicOpenMicListing.count({
      where: { claimInviteEmailSentAt: { not: null } },
    }),
    audits: await prisma.listingClaimAuditEvent.count(),
    claimRequests: await prisma.listingClaimRequest.count(),
    claimed: await prisma.publicOpenMicListing.count({ where: { claimStatus: "CLAIMED" } }),
    venueOwners: await prisma.venueOwner.count(),
    venues: await prisma.venue.count(),
    bookable: await prisma.eventTemplate.count({ where: { isPublic: true } }),
    marketingSends: await prisma.marketingEmailSend.count(),
  };
}

async function evaluateListing() {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: listingSlug },
    include: {
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
        },
      },
      claimRequests: {
        where: { status: { in: ["PENDING", "APPROVED"] } },
        select: { id: true, status: true },
      },
      corrections: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, createdAt: true, status: true, message: true },
      },
    },
  });
  if (!listing) fail("listing_not_found", { listingSlug });

  if (expectedName && !listing.name.toLowerCase().includes(expectedName.toLowerCase())) {
    fail("expected_name_mismatch", { listingName: listing.name });
  }
  for (const needle of allow.nameIncludes) {
    if (!listing.name.includes(needle)) {
      fail("listing_name_does_not_match_allowlist", { listingName: listing.name, needle });
    }
  }

  const leadEmail = listing.growthLead?.contactEmailNormalized
    ? normalizeMarketingEmail(listing.growthLead.contactEmailNormalized)
    : null;
  if (!leadEmail) fail("growth_lead_email_missing", { listingSlug });

  if (useGrowthLeadEmail && !expectedRecipient) {
    expectedRecipient = leadEmail;
  }

  const email = normalizeMarketingEmail(expectedRecipient);
  if (!email || email !== leadEmail) {
    fail("expected_recipient_does_not_match_growth_lead_email", {
      expectedRedacted: expectedRecipient ? redactEmail(expectedRecipient) : null,
      leadRedacted: redactEmail(leadEmail),
    });
  }
  if (!hostsRelated(emailDomain(email) || "", expectedDomain)) {
    fail("recipient_domain_mismatch", {
      recipientRedacted: redactEmail(email),
      expectedDomain,
    });
  }
  if (FREE_MAIL.has(emailDomain(email) || "")) {
    fail("recipient_is_free_mail", { recipientRedacted: redactEmail(email) });
  }

  const siteHost =
    hostOfUrl(listing.websiteUrl) ||
    hostOfUrl(listing.growthLead?.websiteUrl) ||
    hostOfUrl(listing.sourceUrl);
  const recipDomain = emailDomain(email);
  const domainMatch = Boolean(
    siteHost && recipDomain && hostsRelated(recipDomain, siteHost) && hostsRelated(recipDomain, expectedDomain),
  );

  const suppressed = await isMarketingEmailSuppressed(prisma, email);
  const activeTokens = await prisma.listingClaimInviteToken.findMany({
    where: { listingId: listing.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true, expiresAt: true },
  });
  const placeConflict = listing.googlePlaceId
    ? await prisma.venue.count({ where: { googlePlaceId: listing.googlePlaceId } })
    : 0;

  const publicOk = listing.verificationStatus === "VERIFIED";
  const checks = {
    verified: listing.verificationStatus === "VERIFIED",
    unclaimed: listing.claimStatus === "UNCLAIMED" && !listing.claimedVenueId,
    claimStatusUnclaimed: listing.claimStatus === "UNCLAIMED",
    claimedVenueIdNull: listing.claimedVenueId == null,
    notOutdated: listing.verificationStatus !== "OUTDATED",
    noCancellationSignal: !/cancel+ed|permanently closed|closed permanently/i.test(
      `${listing.name} ${listing.about ?? ""} ${listing.internalNotes ?? ""}`,
    ),
    hasGooglePlaceId: Boolean(listing.googlePlaceId),
    highConfidence: listing.growthLead?.contactEmailConfidence === "HIGH",
    emailEligible: isClaimInviteEmailEligible({
      email,
      confidence: listing.growthLead?.contactEmailConfidence,
      websiteUrl: listing.websiteUrl ?? listing.growthLead?.websiteUrl,
      sourceUrl: listing.sourceUrl,
    }),
    notFreeMail: !isFreeMailDomain(email),
    domainMatch,
    siteHostMatchesExpected: Boolean(siteHost && hostsRelated(siteHost, expectedDomain)),
    notSuppressed: !suppressed.suppressed,
    noActiveTokens: activeTokens.length === 0,
    noPriorInviteStamp: listing.claimInviteEmailSentAt == null,
    noConflictingClaimRequests: listing.claimRequests.length === 0,
    noPlaceOnAnotherVenue: placeConflict === 0,
    noRecentDoubtCorrection: !listing.corrections.some(
      (c) => c.status === "PENDING" || /wrong|fraud|not.*(venue|open.?mic)/i.test(c.message ?? ""),
    ),
    evidenceTerminalOk: !/PLACE_OR_REGION_CONFLICT|CANCELLED|CLOSED/i.test(
      listing.evidenceTerminalReason ?? listing.internalNotes ?? "",
    ),
  };

  const failures = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const payload = buildListingClaimInvitePayload({
    listingName: listing.name,
    listingSlug: listing.slug,
    city: listing.city,
    region: listing.region,
    venueName: listing.name,
    // Never put a real token in preview output.
    claimUrl: "[SECURE CLAIM LINK]",
  });

  return {
    listing,
    email,
    siteHost,
    recipDomain,
    suppressed,
    activeTokens,
    checks,
    failures,
    publicOk,
    preview: {
      subject: payload.subject,
      textBody: payload.textBody,
      htmlBody: payload.htmlBody,
    },
  };
}

async function main() {
  const before = await snapshotCounts();
  const evaled = await evaluateListing();
  const { listing, email, checks, failures, preview, siteHost, recipDomain, suppressed } = evaled;

  const preSend = {
    ok: failures.length === 0,
    mode: previewOnly ? "preview" : confirmSend ? "send" : "eligibility_only",
    label: allow.label,
    listingId: listing.id,
    listingSlug: listing.slug,
    listingName: listing.name,
    city: listing.city,
    region: listing.region,
    verificationStatus: listing.verificationStatus,
    claimStatus: listing.claimStatus,
    claimedVenueId: listing.claimedVenueId,
    googlePlaceIdPresent: Boolean(listing.googlePlaceId),
    recipientRedacted: redactEmail(email),
    recipientDomain: recipDomain,
    siteHost,
    expectedDomain,
    confidence: listing.growthLead?.contactEmailConfidence ?? null,
    confidenceReason: "growth_lead_contactEmailConfidence",
    officialDomainMatch: checks.domainMatch,
    suppression: suppressed,
    checks,
    failures,
    before,
    emailPreview: preview,
    gates: {
      hostingerCronUntouched: true,
      processPerCronForcedZero: process.env.LISTING_CLAIM_INVITES_PER_CRON,
      processCanaryMode: process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE,
      note: "MICSTAGE_CLAIM_INVITES_ENABLED is enabled only in-process at send time",
    },
  };

  console.log(JSON.stringify(preSend, null, 2));

  if (failures.length) {
    fail("eligibility_failed", { failures });
  }

  if (previewOnly || !confirmSend) {
    console.log(
      JSON.stringify({
        ok: true,
        stopped: true,
        reason: previewOnly ? "preview_only" : "missing_confirm_real_canary_send",
        next: "Re-run with --confirm-real-canary-send after owner copy review.",
      }),
    );
    return;
  }

  // In-process enable only — does not change Hostinger env or cron limits.
  process.env.MICSTAGE_CLAIM_INVITES_ENABLED = "true";

  // Re-check immediately before token creation
  const again = await evaluateListing();
  if (again.failures.length) fail("eligibility_failed_on_recheck", { failures: again.failures });

  const issued = await issueListingClaimInviteToken(prisma, {
    listingId: listing.id,
    intendedEmailNormalized: email,
  });

  const claimUrl = `https://micstage.com/claim/invite/${issued.rawToken}`;
  const payload = buildListingClaimInvitePayload({
    listingName: listing.name,
    listingSlug: listing.slug,
    city: listing.city,
    region: listing.region,
    venueName: listing.name,
    claimUrl,
  });

  // Final copy gate for Starr Hill (and shared subject for all canaries).
  if (payload.subject !== "Claim your free MicStage open mic listing") {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("subject_mismatch", { tokenId: issued.tokenId, tokenStatus: "REVOKED" });
  }
  if (!payload.textBody.includes(listing.name)) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("body_missing_listing_name", { tokenId: issued.tokenId, tokenStatus: "REVOKED" });
  }
  if (!payload.htmlBody.includes("Claim Your Free Listing")) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("html_missing_cta_button", { tokenId: issued.tokenId, tokenStatus: "REVOKED" });
  }
  if (!payload.textBody.includes(`https://micstage.com/open-mics/${listing.slug}`)) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("body_missing_public_listing_url", { tokenId: issued.tokenId, tokenStatus: "REVOKED" });
  }
  if (!claimUrl.includes(`/claim/invite/`) || !claimUrl.endsWith(issued.rawToken)) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("claim_url_invalid", { tokenId: issued.tokenId, tokenStatus: "REVOKED" });
  }
  let sendResult;
  try {
    sendResult = await deliverResendEmail({
      to: email,
      subject: payload.subject,
      text: payload.textBody,
      html: payload.htmlBody,
      category: "transactional",
      fromOverride: transactionalFromAddress(),
      replyTo: "drummer@micstage.com",
      allowDevSkipWhenNoApiKey: false,
    });
  } catch (e) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("provider_send_failed", {
      message: e instanceof Error ? e.message : String(e),
      tokenId: issued.tokenId,
      tokenStatus: "REVOKED",
    });
  }

  if (sendResult?.skipped || !sendResult?.messageId) {
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    fail("provider_did_not_accept", {
      skipped: Boolean(sendResult?.skipped),
      tokenId: issued.tokenId,
      tokenStatus: "REVOKED",
    });
  }

  const stampedAt = new Date();
  await prisma.publicOpenMicListing.update({
    where: { id: listing.id },
    data: {
      claimInviteEmailSentAt: stampedAt,
      claimInviteEmail: email,
      claimInviteProviderMessageId: sendResult.messageId,
    },
  });

  const audit = await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: listing.id,
      eventType: "CLAIM_INVITE_SENT",
      meta: {
        tokenId: issued.tokenId,
        hasProviderMessageId: true,
        emailDomain: recipDomain,
        canary: true,
        script: "send-approved-claim-canary",
        providerMessageIdPrefix: String(sendResult.messageId).slice(0, 8),
      },
    },
  });

  // Restore in-process off state
  process.env.MICSTAGE_CLAIM_INVITES_ENABLED = "false";
  process.env.LISTING_CLAIM_INVITES_PER_CRON = "0";

  // Claim-page technical verification using in-memory token only — never log raw token.
  let claimPageVerification = null;
  try {
    const https = await import("node:https");
    const pageBody = await new Promise((resolve, reject) => {
      https
        .get(claimUrl, { headers: { "User-Agent": "MicStageCanaryVerify/1.0" } }, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => resolve({ status: res.statusCode, body: d, location: res.headers.location }));
        })
        .on("error", reject);
    });
    const body = pageBody.body || "";
    const ownersBefore = before.venueOwners;
    const ownersAfterPeek = await prisma.venueOwner.count();
    claimPageVerification = {
      httpStatus: pageBody.status,
      loadsOk: pageBody.status === 200,
      showsListingName: body.includes(listing.name),
      showsAddressOrCity: Boolean(
        (listing.formattedAddress && body.includes(listing.formattedAddress.slice(0, 20))) ||
          (listing.city && body.includes(listing.city)) ||
          body.toLowerCase().includes("richmond"),
      ),
      requiresAuthority: /authority/i.test(body),
      requiresTerms: /terms/i.test(body),
      requiresPrivacy: /privacy/i.test(body),
      bookingOptionalOrDisabled:
        /booking.*optional|optional.*booking|booking.*off|not.*bookable/i.test(body) ||
        !/book now|booking enabled|slots are open/i.test(body),
      recipientEmailNotProminentlyExposed: !body.includes(email),
      rawTokenNotEchoedInHtml: !body.includes(issued.rawToken),
      invitationUnavailable: /invitation unavailable/i.test(body),
      accountCreatedByOpen: ownersAfterPeek !== ownersBefore ? "unexpected_owner_count_change" : false,
      venueOwnersUnchanged: ownersAfterPeek === ownersBefore,
      note: "Page fetched once with live token; token not printed; claim form not submitted.",
    };
  } catch (e) {
    claimPageVerification = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Drop raw token reference before any further logging.
  issued.rawToken = "[REDACTED]";

  const after = await snapshotCounts();
  const tokenRow = await prisma.listingClaimInviteToken.findUnique({
    where: { id: issued.tokenId },
    select: { id: true, status: true, expiresAt: true, tokenHash: true, intendedEmailNormalized: true },
  });
  const chooseTokens = await prisma.listingClaimInviteToken.count({
    where: { listing: { slug: "monday-night-poetry-open-mic-hosted-by-keeping-it-p" } },
  });
  const bookclubTokens = await prisma.listingClaimInviteToken.count({
    where: {
      OR: [
        { listing: { slug: { contains: "bookclub" } } },
        { intendedEmailNormalized: { contains: "bookclub" } },
      ],
    },
  });
  const otherStamped = await prisma.publicOpenMicListing.count({
    where: {
      claimInviteEmailSentAt: { gte: stampedAt },
      slug: { not: listing.slug },
    },
  });
  const msgId = String(sendResult.messageId);
  const providerMessageIdRedacted =
    msgId.length <= 8 ? "[redacted]" : `${msgId.slice(0, 4)}…${msgId.slice(-4)}`;

  console.log(
    JSON.stringify(
      {
        ok: true,
        sent: true,
        label: allow.label,
        listingId: listing.id,
        listingSlug: listing.slug,
        subjectSent: payload.subject,
        recipientRedacted: redactEmail(email),
        recipientDomain: recipDomain,
        tokenId: issued.tokenId,
        tokenStatus: tokenRow?.status ?? null,
        tokenHashStoredOnly: Boolean(tokenRow?.tokenHash && tokenRow.tokenHash.length >= 64),
        tokenExpiresAt: tokenRow?.expiresAt ?? issued.expiresAt,
        providerAccepted: true,
        providerMessageIdRedacted,
        claimInviteEmailSentAt: stampedAt.toISOString(),
        auditEventId: audit.id,
        suppression: suppressed,
        claimStatus: listing.claimStatus,
        claimPageVerification,
        before,
        after,
        deltas: {
          tokens: after.tokens - before.tokens,
          activeTokens: after.activeTokens - before.activeTokens,
          inviteStamp: after.inviteStamp - before.inviteStamp,
          audits: after.audits - before.audits,
          venueOwners: after.venueOwners - before.venueOwners,
          venues: after.venues - before.venues,
          claimed: after.claimed - before.claimed,
          bookable: after.bookable - before.bookable,
        },
        isolation: {
          choose901Tokens: chooseTokens,
          bookclubTokens,
          otherListingsStampedAtSameSecond: otherStamped,
        },
        restoredProcessGates: {
          MICSTAGE_CLAIM_INVITES_ENABLED: "false",
          LISTING_CLAIM_INVITES_PER_CRON: "0",
          MICSTAGE_CLAIM_INVITES_CANARY_MODE: process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: "unhandled", message: String(e?.message || e) }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
