import type { PrismaClient } from "@/generated/prisma/client";
import { CLAIM_INVITE_LISTING_WHERE } from "@/lib/publicListings/claimInviteEligibility";
import {
  isStagedClaimInviteContactEligible,
  listingPassesStagedClaimInviteSafety,
} from "@/lib/publicListings/claimInviteAutomation";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";

/**
 * Count VERIFIED listings that are claim-invite eligible under the same rules
 * the sender uses (staged contact + listing safety including trusted stored evidence).
 */
export async function countEligiblePendingListingClaimInvites(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      ...CLAIM_INVITE_LISTING_WHERE,
      googlePlaceId: { not: null },
      growthLead: {
        contactEmailNormalized: { not: null },
        contactEmailConfidence: "HIGH",
      },
    },
    select: {
      websiteUrl: true,
      sourceUrl: true,
      name: true,
      about: true,
      region: true,
      city: true,
      formattedAddress: true,
      verificationStatus: true,
      claimStatus: true,
      claimedVenueId: true,
      googlePlaceId: true,
      evidenceTerminalReason: true,
      internalNotes: true,
      lastVerifiedAt: true,
      googlePlaceVerifiedAt: true,
      schedules: { select: { title: true, description: true } },
      openMicEvidenceRows: {
        select: {
          trusted: true,
          detectedPhrase: true,
          evidenceExcerpt: true,
          evidenceTitle: true,
          reasonCode: true,
          fetchedAt: true,
          evidenceDate: true,
          currentnessScore: true,
          sourceType: true,
        },
      },
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
        },
      },
    },
    take: 2500,
  });

  let n = 0;
  for (const row of rows) {
    const email = row.growthLead?.contactEmailNormalized;
    if (
      !email ||
      !isStagedClaimInviteContactEligible({
        email,
        confidence: row.growthLead?.contactEmailConfidence,
        websiteUrl: row.websiteUrl ?? row.growthLead?.websiteUrl,
        sourceUrl: row.sourceUrl,
      })
    ) {
      continue;
    }
    const safety = listingPassesStagedClaimInviteSafety({
      ...row,
      discoveryMarketSlug: row.growthLead?.discoveryMarketSlug,
      schedules: row.schedules,
      storedEvidence: row.openMicEvidenceRows,
    });
    if (!safety.ok) continue;
    const sup = await isMarketingEmailSuppressed(prisma, email);
    if (sup.suppressed) continue;
    n += 1;
  }
  return n;
}
