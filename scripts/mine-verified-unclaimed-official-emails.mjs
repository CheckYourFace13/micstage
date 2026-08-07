/**
 * Diagnose VERIFIED unclaimed listings that are not invite-ready,
 * and attempt same-domain official email mining (no free-mail / third-party).
 *
 * Usage: node --import tsx scripts/mine-verified-unclaimed-official-emails.mjs [--dry-run]
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import pg from "pg";
import { discoveryFetchText } from "../src/lib/growth/discovery/discoveryHttp.ts";
import { extractFromHtml } from "../src/lib/growth/discovery/extractFromHtml.ts";
import { pickPrimaryVenueOutreachEmail } from "../src/lib/growth/discovery/venueEmailExtraction.ts";
import { parseGrowthLeadEmailInput } from "../src/lib/growth/leadEmailValidation.ts";
import { persistGrowthLeadEmailContacts } from "../src/lib/growth/growthLeadContactAutomation.ts";
import { isMarketingEmailSuppressed } from "../src/lib/marketing/suppression.ts";
import { countEligiblePendingListingClaimInvites } from "../src/lib/publicListings/claimInvitePendingCount.ts";
import {
  isStagedClaimInviteContactEligible,
} from "../src/lib/publicListings/claimInviteAutomation.ts";

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

const dryRun = process.argv.includes("--dry-run");

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function hostFromUrl(url) {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function contactPathCandidates(websiteUrl) {
  if (!websiteUrl?.trim()) return [];
  let base;
  try {
    base = new URL(websiteUrl.trim());
  } catch {
    return [];
  }
  const origin = `${base.protocol}//${base.host}`;
  const paths = [
    "",
    "/contact",
    "/contact-us",
    "/contactus",
    "/about",
    "/about-us",
    "/info",
    "/book",
    "/booking",
    "/hire",
    "/private-events",
    "/events",
  ];
  return [...new Set(paths.map((p) => (p ? `${origin}${p}` : origin)))];
}

function diagnoseListing(row, suppression) {
  const reasons = [];
  const email = row.growthLead?.contactEmailNormalized?.trim() || null;
  const conf = row.growthLead?.contactEmailConfidence || null;
  const site = row.websiteUrl || row.growthLead?.websiteUrl || null;
  const source = row.sourceUrl || null;

  if (!row.googlePlaceId) reasons.push("missing_google_place_id");
  if (row.claimInviteEmailSentAt) reasons.push("recent_invite");
  if (row.claimStatus !== "UNCLAIMED") reasons.push(`claim_status_${row.claimStatus}`);
  if (row.claimedVenueId) reasons.push("already_claimed_venue");
  if (!email) reasons.push("no_email");
  else {
    if (conf === "MEDIUM") reasons.push("medium_confidence");
    if (conf === "LOW") reasons.push("low_confidence");
    if (conf !== "HIGH" && conf !== "MEDIUM" && conf !== "LOW") reasons.push("missing_confidence");
    const domain = email.includes("@") ? email.split("@")[1]?.toLowerCase() : null;
    if (domain && isFreeMailDomain(domain)) reasons.push("free_mail");
    if (!emailDomainMatchesSiteHost(email, hostFromUrl(site) || hostFromUrl(source))) {
      reasons.push("domain_mismatch");
    }
    if (suppression?.suppressed) reasons.push(`suppression_${suppression.reason || "unknown"}`);
  }

  const activeToken = row.claimInviteTokens?.some((t) => t.status === "ACTIVE");
  if (activeToken) reasons.push("active_token");

  if (row.evidenceAutomationStatus && /FAIL|BLOCK|REJECT/i.test(String(row.evidenceAutomationStatus))) {
    reasons.push(`evidence_${row.evidenceAutomationStatus}`);
  }

  const stagedOk =
    email &&
    isStagedClaimInviteContactEligible({
      email,
      confidence: conf,
      websiteUrl: site,
      sourceUrl: source,
    });
  if (!stagedOk && !reasons.length) reasons.push("staged_eligibility_failed_other");

  return { reasons: reasons.length ? reasons : ["other"], email, conf, site };
}

const eligibleBefore = await countEligiblePendingListingClaimInvites(prisma);

const listings = await prisma.publicOpenMicListing.findMany({
  where: {
    verificationStatus: "VERIFIED",
    claimStatus: "UNCLAIMED",
    claimInviteEmailSentAt: null,
    claimedVenueId: null,
  },
  select: {
    id: true,
    slug: true,
    name: true,
    websiteUrl: true,
    sourceUrl: true,
    googlePlaceId: true,
    claimStatus: true,
    claimInviteEmailSentAt: true,
    claimedVenueId: true,
    evidenceAutomationStatus: true,
    region: true,
    city: true,
    growthLeadId: true,
    growthLead: {
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        websiteHostNormalized: true,
        contactEmailNormalized: true,
        contactEmailConfidence: true,
        contactEmailRejectionReason: true,
        discoveryMarketSlug: true,
        source: true,
        discoveryConfidence: true,
      },
    },
    claimInviteTokens: {
      where: { status: "ACTIVE" },
      select: { id: true, status: true, expiresAt: true },
      take: 3,
    },
  },
  take: 50,
});

const diagnoses = [];
const recovered = [];

for (const row of listings) {
  const email = row.growthLead?.contactEmailNormalized?.trim() || null;
  const suppression = email ? await isMarketingEmailSuppressed(prisma, email) : { suppressed: false };
  const diag = diagnoseListing(row, suppression);

  let mining = null;
  const needsMine =
    !email ||
    diag.reasons.includes("medium_confidence") ||
    diag.reasons.includes("domain_mismatch") ||
    diag.reasons.includes("free_mail") ||
    diag.reasons.includes("no_email");

  if (needsMine && row.growthLeadId && (row.websiteUrl || row.growthLead?.websiteUrl)) {
    const site = row.websiteUrl || row.growthLead?.websiteUrl;
    const urls = contactPathCandidates(site);
    let best = null;
    for (const url of urls.slice(0, 8)) {
      const html = await discoveryFetchText(url);
      if (!html) continue;
      const ex = extractFromHtml(url, html, { maxSameHostLinks: 40 });
      const pageHost = hostFromUrl(url);
      const picked = pickPrimaryVenueOutreachEmail(ex.emailsTagged, pageHost);
      if (!picked.primary) continue;
      const sameHost = emailDomainMatchesSiteHost(picked.primary, pageHost);
      if (!sameHost) continue;
      const domain = picked.primary.split("@")[1]?.toLowerCase();
      if (domain && isFreeMailDomain(domain)) continue;
      const parsed = parseGrowthLeadEmailInput(picked.primary, { extractedFromNoisyText: false });
      if (parsed.kind !== "valid" || parsed.confidence !== "HIGH") continue;
      best = {
        url,
        email: parsed.normalized,
        confidence: parsed.confidence,
        additional: picked.additional || [],
      };
      break;
    }

    if (best) {
      if (!dryRun) {
        await persistGrowthLeadEmailContacts(prisma, {
          leadId: row.growthLeadId,
          leadName: row.growthLead?.name || row.name || "Venue lead",
          discoveryMarketSlug: row.growthLead?.discoveryMarketSlug || "national-discovery-us",
          source: row.growthLead?.source ?? "verified_listing_official_email_mine",
          websiteUrl: site,
          confidence: row.growthLead?.discoveryConfidence ?? null,
          primaryEmail: best.email,
          additionalEmails: best.additional,
        });
        await prisma.growthLead.update({
          where: { id: row.growthLeadId },
          data: {
            contactEmailNormalized: best.email,
            contactEmailRaw: best.email,
            contactEmailConfidence: "HIGH",
            contactEmailRejectionReason: null,
          },
        });
      }
      recovered.push({
        slug: row.slug,
        email: best.email,
        fromUrl: best.url,
        dryRun,
      });
      mining = { status: "recovered_high_official", ...best };
    } else {
      mining = { status: "no_same_domain_high_email_found", triedUrls: urls.length };
    }
  }

  diagnoses.push({
    slug: row.slug,
    name: row.name,
    city: row.city,
    region: row.region,
    ...diag,
    mining,
  });
}

const eligibleAfter = await countEligiblePendingListingClaimInvites(prisma);

console.log(
  JSON.stringify(
    {
      dryRun,
      verifiedUnclaimedNoInvite: listings.length,
      eligibleBefore,
      eligibleAfter,
      recoveredCount: recovered.length,
      recovered,
      diagnoses,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
