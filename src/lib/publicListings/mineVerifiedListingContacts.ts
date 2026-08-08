import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml, rankVenueInternalUrls } from "@/lib/growth/discovery/extractFromHtml";
import { pickPrimaryVenueOutreachEmail } from "@/lib/growth/discovery/venueEmailExtraction";
import { persistGrowthLeadEmailContacts } from "@/lib/growth/growthLeadContactAutomation";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import { isFreeMailDomain } from "@/lib/publicListings/claimAutoApproval";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";
import { isStagedClaimInviteContactEligible } from "@/lib/publicListings/claimInviteAutomation";
import { micstageEmailMiningKillSwitch } from "@/lib/publicListings/automationKillSwitches";

export type MineVerifiedContactsResult = {
  scanned: number;
  mined: number;
  highOfficial: number;
  failed: number;
};

function contactMinePerTick(): number {
  return Math.min(40, Math.max(0, parseIntEnv("LISTING_VERIFIED_CONTACT_MINE_PER_TICK", 20)));
}

/**
 * Dedicated contact-mining queue for VERIFIED unclaimed listings lacking a HIGH
 * same-domain official mailbox. Does not invent contacts from tourism/media domains.
 */
export async function mineVerifiedListingOfficialEmails(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<MineVerifiedContactsResult> {
  if (micstageEmailMiningKillSwitch()) {
    return { scanned: 0, mined: 0, highOfficial: 0, failed: 0 };
  }

  const limit = opts?.limit ?? contactMinePerTick();
  if (limit <= 0) return { scanned: 0, mined: 0, highOfficial: 0, failed: 0 };

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      claimStatus: "UNCLAIMED",
      claimedVenueId: null,
      claimInviteEmailSentAt: null,
      websiteUrl: { not: null },
      googlePlaceId: { not: null },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: Math.min(200, limit * 4),
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      sourceUrl: true,
      growthLeadId: true,
      growthLead: {
        select: {
          id: true,
          name: true,
          discoveryMarketSlug: true,
          source: true,
          websiteUrl: true,
          discoveryConfidence: true,
          contactEmailNormalized: true,
          contactEmailConfidence: true,
        },
      },
    },
  });

  const needMine = rows
    .filter((row) => {
      const email = row.growthLead?.contactEmailNormalized;
      const conf = row.growthLead?.contactEmailConfidence;
      if (!email || !conf) return true;
      return !isStagedClaimInviteContactEligible({
        email,
        confidence: conf,
        websiteUrl: row.websiteUrl,
        sourceUrl: row.sourceUrl,
      });
    })
    .slice(0, limit);

  let mined = 0;
  let highOfficial = 0;
  let failed = 0;

  for (const row of needMine) {
    const site = row.websiteUrl?.trim();
    if (!site || !row.growthLead) {
      failed += 1;
      continue;
    }

    let siteHost: string | null = null;
    try {
      siteHost = new URL(site).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      failed += 1;
      continue;
    }

    const html = await discoveryFetchText(site);
    if (!html) {
      failed += 1;
      continue;
    }

    const ex = extractFromHtml(site, html, { maxSameHostLinks: 48 });
    const deepUrls = rankVenueInternalUrls(ex.sameHostPaths ?? []).slice(0, 6);

    let bestPrimary: string | null = null;
    let bestConfidence: "HIGH" | "MEDIUM" | "LOW" | null = null;
    let additional: string[] = [];

    const consider = (emailsTagged: Parameters<typeof pickPrimaryVenueOutreachEmail>[0], host: string | null) => {
      const picked = pickPrimaryVenueOutreachEmail(emailsTagged, host);
      const sameHost = emailDomainMatchesSiteHost(picked.primary, host);
      const parsed = parseGrowthLeadEmailInput(picked.primary ?? "", {
        extractedFromNoisyText: !sameHost,
      });
      if (parsed.kind !== "valid" || !parsed.normalized) return;
      if (isFreeMailDomain(parsed.normalized)) return;
      if (!sameHost) return;
      const rank = (c: string | null) => (c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : c === "LOW" ? 1 : 0);
      if (rank(parsed.confidence) > rank(bestConfidence)) {
        bestPrimary = parsed.normalized;
        bestConfidence = parsed.confidence;
        additional = picked.additional;
      }
    };

    consider(ex.emailsTagged, siteHost);

    for (const deep of deepUrls) {
      if (bestConfidence === "HIGH") break;
      const deepHtml = await discoveryFetchText(deep);
      if (!deepHtml) continue;
      const deepEx = extractFromHtml(deep, deepHtml, { maxSameHostLinks: 20 });
      consider(deepEx.emailsTagged, siteHost);
    }

    if (!bestPrimary || !bestConfidence) {
      failed += 1;
      continue;
    }

    await persistGrowthLeadEmailContacts(prisma, {
      leadId: row.growthLead.id,
      leadName: row.growthLead.name || row.name,
      discoveryMarketSlug: row.growthLead.discoveryMarketSlug,
      source: row.growthLead.source,
      websiteUrl: row.growthLead.websiteUrl ?? site,
      confidence: row.growthLead.discoveryConfidence,
      primaryEmail: bestPrimary,
      additionalEmails: additional,
    });

    await prisma.growthLead.update({
      where: { id: row.growthLead.id },
      data: {
        contactEmailNormalized: bestPrimary,
        contactEmailRaw: bestPrimary,
        contactEmailConfidence: bestConfidence,
        contactEmailRejectionReason: null,
      },
    });

    // Prefer claim-invite mailbox on the listing when we have HIGH same-domain.
    if (
      isStagedClaimInviteContactEligible({
        email: bestPrimary,
        confidence: bestConfidence,
        websiteUrl: site,
        sourceUrl: row.sourceUrl,
      })
    ) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { claimInviteEmail: bestPrimary },
      });
      highOfficial += 1;
    }

    mined += 1;
  }

  return { scanned: needMine.length, mined, highOfficial, failed };
}
