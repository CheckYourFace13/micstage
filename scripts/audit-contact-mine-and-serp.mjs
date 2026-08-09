/**
 * Audit VERIFIED unclaimed contact-mining blockers + SerpAPI duplicate saturation signals.
 * Usage: node --import tsx scripts/audit-contact-mine-and-serp.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { auditVerifiedContactMineBlockers } from "../src/lib/publicListings/mineVerifiedListingContacts.ts";
import { isStagedClaimInviteContactEligible } from "../src/lib/publicListings/claimInviteAutomation.ts";

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
loadEnvFile(".env");

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const since4h = new Date(Date.now() - 4 * 3600 * 1000);
const since24h = new Date(Date.now() - 24 * 3600 * 1000);

const [mineAudit, inviteReady, verifiedUnclaimed, recentRuns, publishBacklog] = await Promise.all([
  auditVerifiedContactMineBlockers(prisma),
  prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      claimStatus: "UNCLAIMED",
      claimedVenueId: null,
      claimInviteEmailSentAt: null,
      googlePlaceId: { not: null },
    },
    select: {
      websiteUrl: true,
      sourceUrl: true,
      growthLead: { select: { contactEmailNormalized: true, contactEmailConfidence: true } },
    },
    take: 5000,
  }),
  prisma.publicOpenMicListing.count({
    where: { verificationStatus: "VERIFIED", claimStatus: "UNCLAIMED", claimedVenueId: null },
  }),
  prisma.growthDiscoveryRun.findMany({
    where: { createdAt: { gte: since24h } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      createdAt: true,
      candidatesTotal: true,
      createdLeads: true,
      duplicateLeads: true,
      skippedLeads: true,
      summary: true,
    },
  }),
  prisma.growthLead.count({
    where: {
      leadType: "VENUE",
      status: { notIn: ["REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
      openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
      NOT: { publicListings: { some: {} } },
    },
  }),
]);

let inviteReadyHigh = 0;
for (const row of inviteReady) {
  const email = row.growthLead?.contactEmailNormalized;
  const conf = row.growthLead?.contactEmailConfidence;
  if (
    email &&
    conf &&
    isStagedClaimInviteContactEligible({
      email,
      confidence: conf,
      websiteUrl: row.websiteUrl,
      sourceUrl: row.sourceUrl,
    })
  ) {
    inviteReadyHigh += 1;
  }
}

const recentLeads = await prisma.growthLead.findMany({
  where: { createdAt: { gte: since4h }, source: { contains: "autonomous_web_search" } },
  select: { websiteHostNormalized: true, source: true, discoveryMarketSlug: true, region: true },
  take: 500,
});

const hostCounts = {};
for (const l of recentLeads) {
  const h = l.websiteHostNormalized || "unknown";
  hostCounts[h] = (hostCounts[h] || 0) + 1;
}

const runStats = recentRuns.map((r) => ({
  at: r.createdAt,
  candidates: r.candidatesTotal,
  created: r.createdLeads,
  duplicates: r.duplicateLeads,
  skipped: r.skippedLeads,
  uniquePerCand:
    r.candidatesTotal > 0 ? Number((r.createdLeads / r.candidatesTotal).toFixed(3)) : null,
}));

console.log(
  JSON.stringify(
    {
      publishBacklogActive: publishBacklog,
      verifiedUnclaimed,
      inviteReadyHighOfficial: inviteReadyHigh,
      contactMineAudit: mineAudit,
      discoveryRuns24h: runStats.slice(0, 12),
      recent4hAutonomousLeadHostsTop: Object.entries(hostCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
