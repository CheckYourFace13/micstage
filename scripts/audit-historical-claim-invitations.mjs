/**
 * Read-only audit of all PublicOpenMicListing rows with claimInviteEmailSentAt.
 * Never prints full emails or secrets. Writes redacted JSON under tmp/ (gitignored).
 *
 * Usage: node scripts/audit-historical-claim-invitations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
if (!url) {
  console.error(JSON.stringify({ ok: false, error: "No DATABASE_URL" }));
  process.exit(1);
}

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

function redactEmail(e) {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at < 0) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const root = domain.split(".")[0] || domain;
  return `${local.slice(0, 1)}***@${root.slice(0, 2)}***${root.length > 2 ? root.slice(-1) : ""}.${domain.split(".").slice(1).join(".") || "*"}`;
}

function hostFromEmail(email) {
  const i = email?.lastIndexOf("@") ?? -1;
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function hostFromUrl(u) {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function hostsRelated(a, b) {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function hashId(id) {
  return createHash("sha256").update(String(id)).digest("hex").slice(0, 12);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const invited = await prisma.publicOpenMicListing.findMany({
    where: { claimInviteEmailSentAt: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      websiteUrl: true,
      sourceUrl: true,
      sourceName: true,
      verificationStatus: true,
      claimStatus: true,
      claimedVenueId: true,
      claimInviteEmailSentAt: true,
      claimInviteEmail: true,
      googlePlaceId: true,
      googlePlaceVerifiedAt: true,
      internalNotes: true,
      growthLeadId: true,
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          sourceKind: true,
          discoveryMarketSlug: true,
        },
      },
      claimRequests: {
        select: {
          id: true,
          createdAt: true,
          status: true,
          role: true,
          email: true,
          desiredLoginEmail: true,
          proofUrl: true,
          notes: true,
          reviewedAt: true,
          reviewedByEmail: true,
          reviewNotes: true,
          contactName: true,
        },
        orderBy: { createdAt: "asc" },
      },
      claimedVenue: {
        select: { id: true, slug: true, name: true, ownerId: true },
      },
    },
    orderBy: { claimInviteEmailSentAt: "asc" },
  });

  const emails = [
    ...new Set(
      invited
        .map((r) => (r.claimInviteEmail || r.growthLead?.contactEmailNormalized || "").toLowerCase())
        .filter(Boolean),
    ),
  ];

  const [suppressions, marketingSends, allClaimRequests] = await Promise.all([
    prisma.marketingEmailSuppression.findMany({
      where: { emailNormalized: { in: emails } },
      select: { emailNormalized: true, reason: true, createdAt: true, sourceNote: true },
    }),
    prisma.marketingEmailSend.findMany({
      where: {
        OR: [
          { toEmailNormalized: { in: emails } },
          { templateKind: { contains: "CLAIM", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        toEmailNormalized: true,
        templateKind: true,
        category: true,
        status: true,
        providerMessageId: true,
        sentAt: true,
        failedAt: true,
        blockedReason: true,
        purposeKey: true,
        createdAt: true,
      },
      take: 5000,
    }),
    prisma.listingClaimRequest.findMany({
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            name: true,
            verificationStatus: true,
            claimStatus: true,
            claimedVenueId: true,
            claimInviteEmailSentAt: true,
            claimInviteEmail: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const suppressionByEmail = new Map(suppressions.map((s) => [s.emailNormalized, s]));
  const sendsByEmail = new Map();
  for (const s of marketingSends) {
    const arr = sendsByEmail.get(s.toEmailNormalized) || [];
    arr.push(s);
    sendsByEmail.set(s.toEmailNormalized, arr);
  }

  // Duplicate invitation detection: same email invited for multiple listings
  const emailToListingIds = new Map();
  for (const row of invited) {
    const em = (row.claimInviteEmail || "").toLowerCase();
    if (!em) continue;
    const arr = emailToListingIds.get(em) || [];
    arr.push(row.id);
    emailToListingIds.set(em, arr);
  }

  const buckets = {
    providerConfirmedDelivered: 0,
    sentButDeliveryNotConfirmed: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
    suppressed: 0,
    recipientDomainMismatch: 0,
    freeMailRecipient: 0,
    weakConfidenceRecipient: 0,
    duplicateInvitation: 0,
    listingLaterOutdated: 0,
    listingLaterDuplicated: 0,
    claimPageVisited: 0, // not tracked historically
    claimRequestSubmitted: 0,
    claimRequestRejected: 0,
    claimRequestAbandoned: 0,
    claimRequestApproved: 0,
    noObservableEngagement: 0,
    dataIncomplete: 0,
  };

  const byConfidence = { HIGH: { n: 0, claims: 0 }, MEDIUM: { n: 0, claims: 0 }, LOW: { n: 0, claims: 0 }, UNKNOWN: { n: 0, claims: 0 } };
  const byDomainMatch = { match: { n: 0, claims: 0 }, mismatch: { n: 0, claims: 0 }, unknown: { n: 0, claims: 0 } };
  const bySourceKind = {};
  const byMarket = {};

  const rows = [];
  for (const row of invited) {
    const email = (row.claimInviteEmail || row.growthLead?.contactEmailNormalized || "").toLowerCase() || null;
    const emailHost = email ? hostFromEmail(email) : null;
    const siteHost =
      hostFromUrl(row.websiteUrl) || hostFromUrl(row.growthLead?.websiteUrl) || hostFromUrl(row.sourceUrl);
    const domainMatch =
      emailHost && siteHost ? hostsRelated(emailHost, siteHost) : emailHost || siteHost ? false : null;
    const confidence = row.growthLead?.contactEmailConfidence || "UNKNOWN";
    const freeMail = Boolean(emailHost && FREE_MAIL.has(emailHost));
    const suppression = email ? suppressionByEmail.get(email) : null;
    const relatedSends = email ? sendsByEmail.get(email) || [] : [];
    // Claim invites never wrote MarketingEmailSend — look for near-window sends anyway
    const nearSend = row.claimInviteEmailSentAt
      ? relatedSends.find((s) => {
          const t = (s.sentAt || s.createdAt)?.getTime?.() ?? new Date(s.sentAt || s.createdAt).getTime();
          const inv = row.claimInviteEmailSentAt.getTime();
          return Math.abs(t - inv) < 10 * 60 * 1000;
        })
      : null;

    const hasClaimRequest = row.claimRequests.length > 0;
    const rejected = row.claimRequests.some((c) => c.status === "REJECTED");
    const approved = row.claimRequests.some((c) => c.status === "APPROVED");
    const pending = row.claimRequests.some((c) => c.status === "PENDING");
    const duplicateInvite = email ? (emailToListingIds.get(email)?.length || 0) > 1 : false;
    const notesDup = /duplicate google place/i.test(row.internalNotes || "");

    const tags = [];
    if (!email) {
      tags.push("data_incomplete");
      buckets.dataIncomplete += 1;
    }
    if (nearSend?.status === "SENT" && nearSend.providerMessageId) {
      tags.push("provider_confirmed_delivered");
      buckets.providerConfirmedDelivered += 1;
    } else if (row.claimInviteEmailSentAt) {
      // Stamp is post-Resend acceptance but messageId was never stored
      tags.push("sent_but_delivery_not_confirmed");
      buckets.sentButDeliveryNotConfirmed += 1;
    }
    if (nearSend?.status === "FAILED") {
      tags.push("failed");
      buckets.failed += 1;
    }
    if (suppression?.reason === "HARD_BOUNCE") {
      tags.push("bounced");
      buckets.bounced += 1;
    }
    if (suppression?.reason === "COMPLAINT") {
      tags.push("complained");
      buckets.complained += 1;
    }
    if (suppression) {
      tags.push("suppressed");
      buckets.suppressed += 1;
    }
    if (domainMatch === false) {
      tags.push("recipient_domain_mismatch");
      buckets.recipientDomainMismatch += 1;
    }
    if (freeMail) {
      tags.push("free_mail_recipient");
      buckets.freeMailRecipient += 1;
    }
    if (confidence === "LOW" || confidence === "MEDIUM" || confidence === "UNKNOWN") {
      if (confidence !== "HIGH") {
        tags.push("weak_confidence_recipient");
        buckets.weakConfidenceRecipient += 1;
      }
    }
    if (duplicateInvite) {
      tags.push("duplicate_invitation");
      buckets.duplicateInvitation += 1;
    }
    if (row.verificationStatus === "OUTDATED") {
      tags.push("listing_later_outdated");
      buckets.listingLaterOutdated += 1;
    }
    if (notesDup) {
      tags.push("listing_later_duplicated");
      buckets.listingLaterDuplicated += 1;
    }
    if (hasClaimRequest) {
      tags.push("claim_request_submitted");
      buckets.claimRequestSubmitted += 1;
    }
    if (rejected) {
      tags.push("claim_request_rejected");
      buckets.claimRequestRejected += 1;
    }
    if (approved) {
      tags.push("claim_request_approved");
      buckets.claimRequestApproved += 1;
    }
    if (pending && !approved) {
      tags.push("claim_request_abandoned_or_pending");
      buckets.claimRequestAbandoned += 1;
    }
    if (!hasClaimRequest && !suppression) {
      tags.push("no_observable_engagement");
      buckets.noObservableEngagement += 1;
    }

    const confKey = confidence in byConfidence ? confidence : "UNKNOWN";
    byConfidence[confKey].n += 1;
    if (hasClaimRequest) byConfidence[confKey].claims += 1;

    const dmKey = domainMatch === true ? "match" : domainMatch === false ? "mismatch" : "unknown";
    byDomainMatch[dmKey].n += 1;
    if (hasClaimRequest) byDomainMatch[dmKey].claims += 1;

    const sk = row.growthLead?.sourceKind || "UNKNOWN";
    bySourceKind[sk] = bySourceKind[sk] || { n: 0, claims: 0 };
    bySourceKind[sk].n += 1;
    if (hasClaimRequest) bySourceKind[sk].claims += 1;

    const mk = row.growthLead?.discoveryMarketSlug || "UNKNOWN";
    byMarket[mk] = byMarket[mk] || { n: 0, claims: 0 };
    byMarket[mk].n += 1;
    if (hasClaimRequest) byMarket[mk].claims += 1;

    rows.push({
      listingIdHash: hashId(row.id),
      slug: row.slug,
      name: row.name,
      city: row.city,
      region: row.region,
      currentVerificationStatus: row.verificationStatus,
      claimStatus: row.claimStatus,
      claimedVenueIdHash: row.claimedVenueId ? hashId(row.claimedVenueId) : null,
      claimInviteEmailSentAt: row.claimInviteEmailSentAt,
      recipientRedacted: redactEmail(email),
      recipientDomain: emailHost,
      siteHost,
      domainMatch,
      currentContactConfidence: confidence,
      freeMail,
      suppressionReason: suppression?.reason ?? null,
      marketingEmailSendId: nearSend?.id ?? null,
      providerMessageId: nearSend?.providerMessageId ?? null,
      sendStatus: nearSend?.status ?? null,
      sendCategory: nearSend?.category ?? null,
      templateKind: nearSend?.templateKind ?? null,
      note:
        "Claim invites use direct Resend and do not create MarketingEmailSend; providerMessageId was never persisted historically.",
      claimRequestCount: row.claimRequests.length,
      claimRequestStatuses: row.claimRequests.map((c) => c.status),
      tags,
      sourceKind: sk,
      market: mk,
    });
  }

  const n = invited.length || 1;
  const claimedCount = invited.filter((r) => r.claimStatus === "CLAIMED" || r.claimedVenueId).length;
  const claimReqCount = invited.filter((r) => r.claimRequests.length > 0).length;

  const claimRequestReviews = allClaimRequests.map((c) => {
    const email = c.email?.toLowerCase() || "";
    const desired = c.desiredLoginEmail?.toLowerCase() || null;
    return {
      claimRequestIdHash: hashId(c.id),
      submittedAt: c.createdAt,
      status: c.status,
      role: c.role,
      contactNameRedacted: c.contactName ? `${c.contactName.slice(0, 1)}***` : null,
      emailRedacted: redactEmail(email),
      desiredLoginEmailRedacted: redactEmail(desired),
      hasProofUrl: Boolean(c.proofUrl),
      notesPreview: c.notes ? c.notes.slice(0, 120) : null,
      reviewedAt: c.reviewedAt,
      reviewedByRedacted: c.reviewedByEmail ? redactEmail(c.reviewedByEmail) : null,
      reviewNotes: c.reviewNotes,
      listing: {
        slug: c.listing.slug,
        name: c.listing.name,
        verificationStatus: c.listing.verificationStatus,
        claimStatus: c.listing.claimStatus,
        claimedVenueIdHash: c.listing.claimedVenueId ? hashId(c.listing.claimedVenueId) : null,
        wasInvited: Boolean(c.listing.claimInviteEmailSentAt),
        inviteEmailMatched:
          c.listing.claimInviteEmail && email
            ? c.listing.claimInviteEmail.toLowerCase() === email
            : null,
      },
      whyNotClaimedVenue:
        c.status === "PENDING"
          ? "Still PENDING — awaiting admin review; approval without venueSlug does not create Venue/VenueOwner"
          : c.status === "APPROVED" && !c.listing.claimedVenueId
            ? "APPROVED but no Venue linked (adminApproveListingClaim without venueSlug leaves CLAIM_PENDING)"
            : c.status === "REJECTED"
              ? "Rejected by admin"
              : c.listing.claimedVenueId
                ? "Linked to venue"
                : "Unknown",
      ownerAction: "manual_review_only — do not auto-approve",
    };
  });

  const report = {
    ok: true,
    capturedAt: new Date().toISOString(),
    totals: {
      invitedListings: invited.length,
      claimRequestsTotal: allClaimRequests.length,
      claimedPublicListings: claimedCount,
      bookableVenues: 0,
    },
    stampSemantics: {
      claimInviteEmailSentAtWritten:
        "AFTER Resend provider acceptance (deliverResendEmail success, not skipped). NOT after delivery webhook. NOT via MarketingEmailSend.",
      marketingEmailSendCreated: false,
      providerMessageIdPersisted: false,
      suppressionCheckedAtSendTime: false,
      historicalImplication:
        "Rows with claimInviteEmailSentAt almost certainly left Resend successfully, but delivery/bounce/open/click cannot be confirmed from DB. No claim tokens were issued — emails linked to public /claim/{slug}.",
    },
    rates: {
      deliveryConfirmedRate: buckets.providerConfirmedDelivered / n,
      sentUnconfirmedRate: buckets.sentButDeliveryNotConfirmed / n,
      bounceRate: buckets.bounced / n,
      complaintRate: buckets.complained / n,
      claimRequestRate: claimReqCount / n,
      approvalRate:
        allClaimRequests.filter((c) => c.status === "APPROVED").length / Math.max(1, allClaimRequests.length),
      claimedVenueRate: claimedCount / n,
      bookableVenueRate: 0,
      noEngagementRate: buckets.noObservableEngagement / n,
      freeMailRate: buckets.freeMailRecipient / n,
      domainMismatchRate: buckets.recipientDomainMismatch / n,
    },
    buckets,
    conversionByConfidence: byConfidence,
    conversionByDomainMatch: byDomainMatch,
    conversionBySourceKind: bySourceKind,
    conversionByMarket: byMarket,
    primaryReasonsZeroClaimedVenues: [
      {
        rank: 1,
        reason: "Activation funnel dead-end",
        detail:
          "Invite CTA went to public /claim/{slug} with no signed token. Submit created ListingClaimRequest + CLAIM_PENDING only. Admin approve does not create VenueOwner/Venue unless an existing venueSlug is supplied. Zero claimed venues means no successful Venue link path completed.",
      },
      {
        rank: 2,
        reason: "No account creation or password-setup on claim",
        detail:
          "Claimants were told to wait for review / register separately. desiredLoginEmail was stored but never used. Friction after open was high.",
      },
      {
        rank: 3,
        reason: "Extremely low conversion into claim requests",
        detail: `Only ${claimReqCount} of ${invited.length} invited listings produced any ListingClaimRequest (~${((100 * claimReqCount) / n).toFixed(1)}%). Most invites had no observable engagement.`,
      },
      {
        rank: 4,
        reason: "Targeting quality historically weaker than current gates",
        detail: `${buckets.freeMailRecipient} free-mail and ${buckets.recipientDomainMismatch} domain-mismatch recipients among invited rows (current confidence may not reflect send-time).`,
      },
      {
        rank: 5,
        reason: "No delivery/engagement telemetry for claim invites",
        detail:
          "Direct Resend path never wrote MarketingEmailSend or message IDs; opens/clicks/claim-page visits were not tracked. Cannot separate non-delivery from non-conversion.",
      },
    ],
    claimRequestOwnerReview: claimRequestReviews,
    canaryArea51Note: invited
      .filter((r) => /area.?51|roswell/i.test(r.name) || /roswell/i.test(r.slug))
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        city: r.city,
        region: r.region,
        addressPreview: r.formattedAddress?.slice(0, 80),
        invited: Boolean(r.claimInviteEmailSentAt),
      })),
    sampleRows: rows.slice(0, 25),
    allRowCount: rows.length,
  };

  const outDir = path.join("tmp", "prod-baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summaryPath = path.join(outDir, `claim-invite-audit-summary-${stamp}.json`);
  const fullPath = path.join(outDir, `claim-invite-audit-full-${stamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ ...report, sampleRows: report.sampleRows }, null, 2));
  fs.writeFileSync(fullPath, JSON.stringify({ ...report, rows }, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        summaryPath,
        fullPath,
        invited: invited.length,
        claimRequests: allClaimRequests.length,
        claimed: claimedCount,
        buckets,
        rates: report.rates,
        primaryReasons: report.primaryReasonsZeroClaimedVenues.map((r) => r.reason),
        claimRequestReviews,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
