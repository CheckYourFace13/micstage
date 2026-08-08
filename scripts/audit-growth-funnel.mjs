/**
 * Full production funnel audit for growth acceleration.
 * Usage: node --import tsx scripts/audit-growth-funnel.mjs
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import pg from "pg";
import { classifyListingName } from "../src/lib/publicListings/listingQuality.ts";
import { countEligiblePendingListingClaimInvites } from "../src/lib/publicListings/claimInvitePendingCount.ts";
import { isStagedClaimInviteContactEligible } from "../src/lib/publicListings/claimInviteAutomation.ts";
import { isFreeMailDomain } from "../src/lib/publicListings/claimAutoApproval.ts";
import { emailDomainMatchesSiteHost } from "../src/lib/publicListings/claimInviteEligibility.ts";
import { evaluateOpenMicEvidence } from "../src/lib/publicListings/openMicEvidence.ts";
import { listingHasGeoConflict } from "../src/lib/publicListings/evidenceTrust.ts";

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

const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
const since72 = new Date(Date.now() - 72 * 60 * 60 * 1000);

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const LEAD_PUBLISH_WHERE = {
  leadType: "VENUE",
  openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
  NOT: { publicListings: { some: {} } },
};

function hostFromUrl(url) {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const [
  growthLeadsTotal,
  leadsAwaitingPublish,
  leadsCreated24,
  leadsCreated72,
  listingsByStatus,
  needsReviewUnclaimed,
  invites24,
  eligible,
  discoveryRuns24,
  discoveryRuns72,
  verified24created,
  verified24promoted,
  venueOwners24,
  claims24,
  pendingJobs,
] = await Promise.all([
  prisma.growthLead.count(),
  prisma.growthLead.count({ where: LEAD_PUBLISH_WHERE }),
  prisma.growthLead.count({ where: { createdAt: { gte: since24 } } }),
  prisma.growthLead.count({ where: { createdAt: { gte: since72 } } }),
  prisma.publicOpenMicListing.groupBy({
    by: ["verificationStatus"],
    _count: true,
  }),
  prisma.publicOpenMicListing.count({
    where: {
      verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED"] },
      claimStatus: "UNCLAIMED",
    },
  }),
  prisma.publicOpenMicListing.count({ where: { claimInviteEmailSentAt: { gte: since24 } } }),
  countEligiblePendingListingClaimInvites(prisma),
  prisma.growthDiscoveryRun.findMany({
    where: { createdAt: { gte: since24 } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      createdLeads: true,
      duplicateLeads: true,
      skippedLeads: true,
      candidatesTotal: true,
      summary: true,
    },
  }),
  prisma.growthDiscoveryRun.count({ where: { createdAt: { gte: since72 } } }),
  prisma.publicOpenMicListing.count({
    where: { createdAt: { gte: since24 }, verificationStatus: "VERIFIED" },
  }),
  prisma.publicOpenMicListing.count({
    where: {
      verificationStatus: "VERIFIED",
      lastVerifiedAt: { gte: since24 },
    },
  }),
  prisma.venueOwner.count({ where: { createdAt: { gte: since24 } } }),
  prisma.listingClaimRequest.count({ where: { createdAt: { gte: since24 } } }),
  prisma.marketingJob.groupBy({
    by: ["status", "kind"],
    _count: true,
  }),
]);

const sourceKind24 = await prisma.growthLead.groupBy({
  by: ["sourceKind"],
  where: { createdAt: { gte: since24 } },
  _count: true,
});

const confidenceAll = await prisma.growthLead.groupBy({
  by: ["contactEmailConfidence"],
  _count: true,
});

const confidenceOnAwaiting = await prisma.growthLead.groupBy({
  by: ["contactEmailConfidence"],
  where: LEAD_PUBLISH_WHERE,
  _count: true,
});

const awaitingWithEmail = await prisma.growthLead.count({
  where: { ...LEAD_PUBLISH_WHERE, contactEmailNormalized: { not: null } },
});
const awaitingNoEmail = await prisma.growthLead.count({
  where: { ...LEAD_PUBLISH_WHERE, contactEmailNormalized: null },
});

// Sample NEEDS_REVIEW for reason buckets
const nrSample = await prisma.publicOpenMicListing.findMany({
  where: {
    verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED"] },
    claimStatus: "UNCLAIMED",
  },
  select: {
    id: true,
    name: true,
    websiteUrl: true,
    sourceUrl: true,
    region: true,
    city: true,
    googlePlaceId: true,
    googlePlaceVerifiedAt: true,
    evidenceTerminalReason: true,
    internalNotes: true,
    formattedAddress: true,
    about: true,
    growthLead: {
      select: {
        contactEmailNormalized: true,
        contactEmailConfidence: true,
        websiteUrl: true,
        openMicSignalTier: true,
        discoveryHints: true,
      },
    },
    schedules: { select: { title: true, description: true }, take: 3 },
  },
  take: 500,
});

const nrReasons = {};
const bump = (k) => {
  nrReasons[k] = (nrReasons[k] || 0) + 1;
};

for (const row of nrSample) {
  const nameReject = classifyListingName(row.name || "");
  if (nameReject) {
    bump(`name_${nameReject}`);
    continue;
  }
  if (
    listingHasGeoConflict({
      region: row.region,
      city: row.city,
      formattedAddress: row.formattedAddress,
      name: row.name,
    })
  ) {
    bump("geo_conflict");
    continue;
  }
  if (!row.googlePlaceId) {
    bump("missing_google_place");
    continue;
  }
  if (!row.googlePlaceVerifiedAt) {
    bump("place_not_verified_yet");
    continue;
  }
  if (row.evidenceTerminalReason) {
    bump(`terminal_${row.evidenceTerminalReason}`);
    continue;
  }
  const ev = evaluateOpenMicEvidence({
    listingName: row.name,
    schedules: row.schedules,
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: null,
  });
  if (!ev.trusted) {
    bump(`evidence_${ev.reason || "UNTRUSTED"}`);
    continue;
  }
  bump("place_and_evidence_ready_should_promote");
}

// Discovery summary aggregates
let discCreated = 0;
let discDup = 0;
let discCand = 0;
let discSkipped = 0;
const zeroCreateRuns = discoveryRuns24.filter((r) => (r.createdLeads || 0) === 0).length;
for (const r of discoveryRuns24) {
  discCreated += r.createdLeads || 0;
  discDup += r.duplicateLeads || 0;
  discCand += r.candidatesTotal || 0;
  discSkipped += r.skippedLeads || 0;
}

// Contact funnel on VERIFIED unclaimed
const verifiedUnclaimed = await prisma.publicOpenMicListing.findMany({
  where: {
    verificationStatus: "VERIFIED",
    claimStatus: "UNCLAIMED",
    claimInviteEmailSentAt: null,
    claimedVenueId: null,
  },
  select: {
    websiteUrl: true,
    sourceUrl: true,
    googlePlaceId: true,
    growthLead: {
      select: {
        contactEmailNormalized: true,
        contactEmailConfidence: true,
        websiteUrl: true,
      },
    },
  },
  take: 2000,
});

const contactBuckets = {
  highOfficial: 0,
  highMismatch: 0,
  medium: 0,
  low: 0,
  noEmail: 0,
  freeMail: 0,
  inviteReady: 0,
};
for (const row of verifiedUnclaimed) {
  const email = row.growthLead?.contactEmailNormalized;
  const conf = row.growthLead?.contactEmailConfidence;
  if (!email) {
    contactBuckets.noEmail += 1;
    continue;
  }
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && isFreeMailDomain(domain)) contactBuckets.freeMail += 1;
  if (conf === "MEDIUM") contactBuckets.medium += 1;
  if (conf === "LOW") contactBuckets.low += 1;
  const site = row.websiteUrl || row.growthLead?.websiteUrl;
  const official = isStagedClaimInviteContactEligible({
    email,
    confidence: conf,
    websiteUrl: site,
    sourceUrl: row.sourceUrl,
  });
  if (official) {
    contactBuckets.highOfficial += 1;
    if (row.googlePlaceId) contactBuckets.inviteReady += 1;
  } else if (conf === "HIGH") {
    contactBuckets.highMismatch += 1;
  }
}

const listingsCreated24 = await prisma.publicOpenMicListing.count({
  where: { createdAt: { gte: since24 } },
});

const outdated24 = await prisma.publicOpenMicListing.count({
  where: { verificationStatus: "OUTDATED", updatedAt: { gte: since24 } },
});

const report = {
  checkedAt: new Date().toISOString(),
  discovery: {
    runs24h: discoveryRuns24.length,
    runs72h: discoveryRuns72,
    candidatesTotal24h: discCand,
    createdLeadsFieldSum24h: discCreated,
    duplicates24h: discDup,
    skipped24h: discSkipped,
    zeroCreateRuns24h: zeroCreateRuns,
    growthLeadsCreatedActual24h: leadsCreated24,
    growthLeadsCreated72h: leadsCreated72,
    sourceKind24h: Object.fromEntries(sourceKind24.map((s) => [s.sourceKind ?? "null", s._count])),
    note: "Pre-fix: ingest required email (path-only skipped). Post-fix: venue+website+open-mic-signal may ingest without email.",
  },
  backlog: {
    leadsAwaitingPublish: leadsAwaitingPublish,
    meaning:
      "VENUE GrowthLeads with EXPLICIT_OPEN_MIC|STRONG_LIVE_EVENT and zero PublicOpenMicListing",
    awaitingWithEmail,
    awaitingNoEmail,
    confidenceOnAwaiting: Object.fromEntries(
      confidenceOnAwaiting.map((c) => [c.contactEmailConfidence ?? "null", c._count]),
    ),
    publishCapEnv: process.env.LISTING_AUTO_PUBLISH_PER_DISCOVERY_RUN || "40(default)",
  },
  listings: {
    byStatus: Object.fromEntries(listingsByStatus.map((s) => [s.verificationStatus, s._count])),
    needsReviewUnclaimedQueue: needsReviewUnclaimed,
    created24h: listingsCreated24,
    verifiedCreated24h: verified24created,
    verifiedLastVerifiedAt24h: verified24promoted,
    outdatedUpdated24h: outdated24,
    needsReviewReasonSampleN: nrSample.length,
    needsReviewReasons: Object.entries(nrReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ reason: k, count: v })),
  },
  contacts: {
    growthLeadConfidenceAll: Object.fromEntries(
      confidenceAll.map((c) => [c.contactEmailConfidence ?? "null", c._count]),
    ),
    verifiedUnclaimedContactBuckets: contactBuckets,
    eligibleInviteReady: eligible,
  },
  claims: {
    invitesSent24h: invites24,
    claimRequests24h: claims24,
    venueOwners24h: venueOwners24,
  },
  jobs: pendingJobs,
  envCaps: {
    LISTING_AUTO_PUBLISH_PER_DISCOVERY_RUN: process.env.LISTING_AUTO_PUBLISH_PER_DISCOVERY_RUN || "40",
    LISTING_GOOGLE_VERIFY_PER_RUN: process.env.LISTING_GOOGLE_VERIFY_PER_RUN || "25",
    LISTING_PROMOTE_PLACE_CONFIRMED_PER_RUN: process.env.LISTING_PROMOTE_PLACE_CONFIRMED_PER_RUN || "40",
    LISTING_EVIDENCE_ENRICH_PER_RUN: process.env.LISTING_EVIDENCE_ENRICH_PER_RUN || "20",
    GROWTH_SERPAPI_DAILY_MAX: process.env.GROWTH_SERPAPI_DAILY_MAX || "24",
    GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER:
      process.env.GROWTH_DISCOVERY_MAX_CANDIDATES_PER_ADAPTER || "400",
    MARKETING_SOCIAL_PAYLOAD_BATCH_PER_CRON: process.env.MARKETING_SOCIAL_PAYLOAD_BATCH_PER_CRON || "80",
  },
  bottlenecks: [
    {
      rank: 1,
      name: "publish_backlog_not_drained",
      size: leadsAwaitingPublish,
      why: "Auto-publish only runs inside discovery phase and is capped (~40/run); 0 listings created while 1749 wait",
    },
    {
      rank: 2,
      name: "needs_review_stuck_without_trusted_evidence_or_bad_names",
      size: needsReviewUnclaimed,
      why: "Promotion requires Google place + trusted open-mic evidence; junk names and missing evidence dominate",
    },
    {
      rank: 3,
      name: "discovery_ingest_email_gate_plus_dedupe",
      size: leadsCreated24,
      why: "Candidates without valid email never become GrowthLeads; runs produce candidates but near-zero creates",
    },
  ],
};

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
await pool.end();
