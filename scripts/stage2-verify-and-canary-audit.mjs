/**
 * Stage 2: capture before/after funnel metrics, optional cron triggers,
 * and a redacted 5-recipient claim-invite canary audit (does NOT send).
 *
 * Usage:
 *   node scripts/stage2-verify-and-canary-audit.mjs
 *   node scripts/stage2-verify-and-canary-audit.mjs --run-crons
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

function redactEmail(e) {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at < 0) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const dParts = domain.split(".");
  const redDomain =
    dParts.length >= 2
      ? `${dParts[0].slice(0, 2)}***${dParts[0].length > 2 ? dParts[0].slice(-1) : ""}.${dParts.slice(1).join(".")}`
      : "***";
  return `${local.slice(0, 1)}***@${redDomain}`;
}

function redactAddress(a) {
  if (!a?.trim()) return null;
  const s = a.trim();
  if (s.length <= 12) return "***";
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function hostFromUrl(u) {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function hostFromEmail(email) {
  const i = email.lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function hostsRelated(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function hashId(id) {
  return createHash("sha256").update(String(id)).digest("hex").slice(0, 12);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const runCrons = process.argv.includes("--run-crons");
const outDir = path.join("tmp", "prod-baselines");
fs.mkdirSync(outDir, { recursive: true });

async function snapshot(label) {
  const [
    listingsByStatus,
    highLeads,
    mediumLeads,
    claimInviteSent,
    claimInviteEligibleCount,
    miningPending,
    miningCompleted,
    googleUnattempted,
    venueOwners,
    venues,
    musicians,
    sends,
    suppressions,
    claimRequests,
    claimedListings,
    eventTemplates,
  ] = await Promise.all([
    prisma.publicOpenMicListing.groupBy({ by: ["verificationStatus"], _count: true }),
    prisma.growthLead.count({ where: { contactEmailConfidence: "HIGH" } }),
    prisma.growthLead.count({ where: { contactEmailConfidence: "MEDIUM" } }),
    prisma.publicOpenMicListing.count({ where: { claimInviteEmailSentAt: { not: null } } }),
    prisma.publicOpenMicListing.count({
      where: {
        claimInviteEmailSentAt: null,
        claimedVenueId: null,
        claimStatus: { not: "CLAIMED" },
        verificationStatus: "VERIFIED",
        growthLead: {
          contactEmailNormalized: { not: null },
          contactEmailConfidence: "HIGH",
        },
      },
    }),
    prisma.marketingJob.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }).catch(() => null),
    prisma.marketingJob.count({ where: { status: "SUCCEEDED" } }).catch(() => null),
    prisma.publicOpenMicListing.count({
      where: {
        verificationStatus: "NEEDS_REVIEW",
        OR: [{ googlePlaceId: null }, { googlePlaceId: "" }],
      },
    }),
    prisma.venueOwner.count(),
    prisma.venue.count(),
    prisma.musicianUser.count(),
    prisma.marketingEmailSend.count(),
    prisma.marketingEmailSuppression.count(),
    prisma.listingClaimRequest.count(),
    prisma.publicOpenMicListing.count({ where: { claimStatus: "CLAIMED" } }),
    // Bookable = claimed public listing with an active published schedule path; approximate via EventTemplate count on Venue
    prisma.eventTemplate.count().catch(() => 0),
  ]);

  const statusMap = Object.fromEntries(listingsByStatus.map((r) => [r.verificationStatus, r._count]));

  // Mining queue depth via GrowthLead fields if MarketingJob schema differs
  const leadsNeedingMine = await prisma.growthLead.count({
    where: {
      contactEmailNormalized: null,
      websiteUrl: { not: null },
    },
  });

  return {
    label,
    at: new Date().toISOString(),
    venueOwners,
    venues,
    musicians,
    VERIFIED: statusMap.VERIFIED ?? 0,
    NEEDS_REVIEW: statusMap.NEEDS_REVIEW ?? 0,
    OUTDATED: statusMap.OUTDATED ?? 0,
    highLeads,
    mediumLeads,
    claimInviteSent,
    claimInviteEligibleHighApprox: claimInviteEligibleCount,
    googleUnattemptedNeedsReview: googleUnattempted,
    miningJobsPending: miningPending,
    miningJobsCompleted: miningCompleted,
    leadsWithoutEmailWithWebsite: leadsNeedingMine,
    sends,
    suppressions,
    claimRequests,
    claimedListings,
    eventTemplates,
    bookableVenuesApprox: eventTemplates > 0 ? "has_templates" : 0,
  };
}

async function auditCanaryTop5() {
  const suppressions = await prisma.marketingEmailSuppression.findMany({
    select: { emailNormalized: true, reason: true },
  });
  const suppressed = new Set(suppressions.map((s) => s.emailNormalized).filter(Boolean));

  const existingVenuePlaceIds = new Set(
    (await prisma.venue.findMany({ select: { googlePlaceId: true } }))
      .map((v) => v.googlePlaceId)
      .filter(Boolean),
  );

  const listings = await prisma.publicOpenMicListing.findMany({
    where: {
      claimInviteEmailSentAt: null,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: "VERIFIED",
      growthLead: {
        contactEmailNormalized: { not: null },
        contactEmailConfidence: "HIGH",
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      region: true,
      formattedAddress: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      verificationStatus: true,
      claimStatus: true,
      lastVerifiedAt: true,
      growthLead: {
        select: {
          id: true,
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          name: true,
          openMicSignalTier: true,
        },
      },
      claimedVenueId: true,
    },
    orderBy: [{ lastVerifiedAt: "desc" }, { createdAt: "asc" }],
    take: 500,
  });

  const freeMail = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "live.com",
    "me.com",
    "msn.com",
  ]);

  const candidates = [];
  for (const row of listings) {
    const email = row.growthLead?.contactEmailNormalized;
    if (!email) continue;
    if (suppressed.has(email)) continue;
    if (row.googlePlaceId && existingVenuePlaceIds.has(row.googlePlaceId)) continue;

    const emailHost = hostFromEmail(email);
    const siteHost =
      hostFromUrl(row.websiteUrl) || hostFromUrl(row.growthLead?.websiteUrl) || hostFromUrl(row.sourceUrl);
    const domainMatch = Boolean(emailHost && siteHost && hostsRelated(emailHost, siteHost));
    if (!domainMatch) continue; // strongest canary: official-domain HIGH
    if (emailHost && freeMail.has(emailHost)) continue;

    candidates.push({
      listingIdHash: hashId(row.id),
      listingSlug: row.slug,
      listingName: row.name,
      city: row.city,
      region: row.region,
      addressRedacted: redactAddress(row.formattedAddress),
      emailRedacted: redactEmail(email),
      emailDomain: emailHost,
      siteHost,
      domainMatch,
      confidence: row.growthLead?.contactEmailConfidence,
      verificationStatus: row.verificationStatus,
      claimStatus: row.claimStatus,
      hasGooglePlaceId: Boolean(row.googlePlaceId),
      lastVerifiedAt: row.lastVerifiedAt,
      openMicSignalTier: row.growthLead?.openMicSignalTier ?? null,
      checks: {
        verified: row.verificationStatus === "VERIFIED",
        unclaimed: row.claimStatus !== "CLAIMED" && !row.claimedVenueId,
        highConfidence: row.growthLead?.contactEmailConfidence === "HIGH",
        officialDomainMatch: domainMatch,
        notSuppressed: true,
        notExistingVenuePlace: !(row.googlePlaceId && existingVenuePlaceIds.has(row.googlePlaceId)),
        notFreeMail: !(emailHost && freeMail.has(emailHost)),
        claimLinkNotGenerated: true,
      },
    });
    if (candidates.length >= 5) break;
  }

  return {
    requested: 5,
    found: candidates.length,
    note: "Redacted audit only — no claim tokens generated, no emails sent",
    candidates,
  };
}

async function callCron(phase) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!secret) return { ok: false, error: "CRON_SECRET missing locally" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 360_000);
  try {
    const res = await fetch(`https://micstage.com/api/cron/growth-pipeline?phase=${phase}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, phase, body };
  } catch (e) {
    return { ok: false, phase, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

function secretPresence() {
  const keys = [
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GROWTH_EVENTBRITE_TOKEN",
    "GROWTH_BRAVE_SEARCH_API_KEY",
    "GROWTH_SERPAPI_KEY",
    "RESEND_API_KEY",
    "CRON_SECRET",
    "MICSTAGE_CRON_SECRET",
    "DATABASE_URL",
    "DIRECT_URL",
    "EMAIL_FROM",
    "MICSTAGE_CLAIM_INVITES_ENABLED",
    "MICSTAGE_CLAIM_INVITES_CANARY_MODE",
    "LISTING_CLAIM_INVITES_PER_CRON",
    "GROWTH_DISCOVERY_MARKET_SLUGS",
  ];
  const present = {};
  for (const k of keys) {
    const v = process.env[k];
    present[k] = v != null && String(v).trim() !== "" ? "present" : "missing";
  }
  // Local safety gate values (not Hostinger) — report boolean interpretation only
  const claimEnabled = String(process.env.MICSTAGE_CLAIM_INVITES_ENABLED || "")
    .trim()
    .toLowerCase();
  const canary = String(process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE || "")
    .trim()
    .toLowerCase();
  const perCron = String(process.env.LISTING_CLAIM_INVITES_PER_CRON || "").trim();
  return {
    localEnvPresence: present,
    localSafetyInterpretation: {
      MICSTAGE_CLAIM_INVITES_ENABLED: claimEnabled || "(unset → treated as false by code)",
      MICSTAGE_CLAIM_INVITES_CANARY_MODE: canary || "(unset → treated as true/canary by code)",
      LISTING_CLAIM_INVITES_PER_CRON: perCron || "(unset)",
      note: "Hostinger production env must be confirmed separately; runtime gate verified via cron claimInvite sent=0",
    },
  };
}

try {
  const before = await snapshot("before");
  let discoveryResult = null;
  let tickResult = null;
  if (runCrons) {
    discoveryResult = await callCron("discovery");
    tickResult = await callCron("tick");
  }
  const after = await snapshot("after");
  const canary = await auditCanaryTop5();
  const secrets = secretPresence();

  const report = {
    ok: true,
    capturedAt: new Date().toISOString(),
    secrets,
    before,
    after,
    deltas: {
      NEEDS_REVIEW: after.NEEDS_REVIEW - before.NEEDS_REVIEW,
      VERIFIED: after.VERIFIED - before.VERIFIED,
      OUTDATED: after.OUTDATED - before.OUTDATED,
      highLeads: after.highLeads - before.highLeads,
      mediumLeads: after.mediumLeads - before.mediumLeads,
      claimInviteSent: after.claimInviteSent - before.claimInviteSent,
      leadsWithoutEmailWithWebsite: after.leadsWithoutEmailWithWebsite - before.leadsWithoutEmailWithWebsite,
    },
    discoveryResult: discoveryResult
      ? {
          ok: discoveryResult.ok,
          status: discoveryResult.status,
          phase: discoveryResult.phase,
          error: discoveryResult.error,
          // Strip large bodies; keep key fields
          summary: discoveryResult.body && typeof discoveryResult.body === "object"
            ? {
                ok: discoveryResult.body.ok,
                phase: discoveryResult.body.phase,
                discoveryEnabled: discoveryResult.body.discoveryEnabled,
                discoveryError: discoveryResult.body.discoveryError,
                discoveryCreated: discoveryResult.body.discovery?.created,
                discoveryDuplicates: discoveryResult.body.discovery?.duplicates,
                markets: discoveryResult.body.discovery?.markets,
                rotationOffset: discoveryResult.body.discovery?.rotationOffset,
                listingAutoPublish: discoveryResult.body.listingAutoPublish
                  ? {
                      created: discoveryResult.body.listingAutoPublish.created,
                      skipped: discoveryResult.body.listingAutoPublish.skipped,
                      verifiedPromoted: discoveryResult.body.listingAutoPublish.verifiedPromoted ?? discoveryResult.body.listingAutoPublish.promoted,
                      claimInvitesAttempted: discoveryResult.body.listingAutoPublish.claimInvitesAttempted,
                    }
                  : null,
              }
            : discoveryResult.body,
        }
      : { skipped: true, reason: "pass --run-crons to trigger" },
    tickResult: tickResult
      ? {
          ok: tickResult.ok,
          status: tickResult.status,
          summary: tickResult.body && typeof tickResult.body === "object"
            ? {
                ok: tickResult.body.ok,
                phase: tickResult.body.phase,
                listingClaimInvites: tickResult.body.listingClaimInvites,
                emailMining: tickResult.body.emailMining
                  ? {
                      processed: tickResult.body.emailMining.processed,
                      emailsFound: tickResult.body.emailMining.emailsFound,
                      upgradedToHigh: tickResult.body.emailMining.upgradedToHigh,
                      failures: tickResult.body.emailMining.failures,
                    }
                  : null,
                pendingClaimInvites: tickResult.body.pendingClaimInvites,
              }
            : tickResult.body,
        }
      : { skipped: true },
    canaryAudit: canary,
    zeroClaimInvitesSentThisRun: (after.claimInviteSent - before.claimInviteSent) === 0,
  };

  const outPath = path.join(outDir, `stage2-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, ...report }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
