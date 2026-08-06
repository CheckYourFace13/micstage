import type { PrismaClient } from "@/generated/prisma/client";
import {
  CLAIM_INVITE_LISTING_WHERE,
  isClaimInviteEmailEligible,
} from "@/lib/publicListings/claimInviteEligibility";

/**
 * Count VERIFIED listings that are actually claim-invite eligible (HIGH or domain-matched MEDIUM).
 * Ineligible scraped MEDIUM emails must not pause cold outreach.
 */
export async function countEligiblePendingListingClaimInvites(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: CLAIM_INVITE_LISTING_WHERE,
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
      isClaimInviteEmailEligible({
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
