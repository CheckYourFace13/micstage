import type { PrismaClient } from "@/generated/prisma/client";
import { CLAIM_INVITE_LISTING_WHERE } from "@/lib/publicListings/claimInviteEligibility";
import { isStagedClaimInviteContactEligible } from "@/lib/publicListings/claimInviteAutomation";

/**
 * Count VERIFIED listings that are claim-invite eligible under staged rules
 * (HIGH + official same-domain + not free-mail).
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
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
        },
      },
    },
    take: 2500,
  });

  let n = 0;
  for (const row of rows) {
    const email = row.growthLead?.contactEmailNormalized;
    if (
      email &&
      isStagedClaimInviteContactEligible({
        email,
        confidence: row.growthLead?.contactEmailConfidence,
        websiteUrl: row.websiteUrl ?? row.growthLead?.websiteUrl,
        sourceUrl: row.sourceUrl,
      })
    ) {
      n += 1;
    }
  }
  return n;
}
