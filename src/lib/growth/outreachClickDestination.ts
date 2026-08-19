/**
 * Resolve first-party click destinations for growth outreach sends.
 */
import type { GrowthLead, PublicOpenMicListing } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

type LeadForDestination = Pick<GrowthLead, "id" | "leadType"> & {
  publicListings?: Pick<PublicOpenMicListing, "slug" | "claimStatus" | "verificationStatus">[];
};

export function pickListingForOutreachClick(
  listings: Pick<PublicOpenMicListing, "slug" | "claimStatus" | "verificationStatus">[] | undefined,
): Pick<PublicOpenMicListing, "slug" | "claimStatus" | "verificationStatus"> | null {
  if (!listings?.length) return null;
  const renderable = listings.filter(
    (l) =>
      l.claimStatus === "UNCLAIMED" &&
      (l.verificationStatus === "VERIFIED" || l.verificationStatus === "NEEDS_REVIEW"),
  );
  return renderable[0] ?? null;
}

export function buildGrowthLeadClickDestination(
  lead: LeadForDestination,
  listing?: Pick<PublicOpenMicListing, "slug" | "claimStatus" | "verificationStatus"> | null,
): string {
  const baseUrl = appBaseUrl().replace(/\/$/, "");
  const listingRow = listing ?? pickListingForOutreachClick(lead.publicListings);

  if (lead.leadType === "PROMOTER_ACCOUNT") {
    return `${baseUrl}/host?growthLead=${encodeURIComponent(lead.id)}`;
  }
  if (lead.leadType === "ARTIST") {
    return `${baseUrl}/register/musician?growthLead=${encodeURIComponent(lead.id)}`;
  }

  if (listingRow?.slug) {
    return `${baseUrl}/open-mics/${encodeURIComponent(listingRow.slug)}?growthLead=${encodeURIComponent(lead.id)}`;
  }
  return `${baseUrl}/register/venue?growthLead=${encodeURIComponent(lead.id)}`;
}

export async function resolveGrowthLeadClickDestination(
  prisma: PrismaClient,
  leadId: string,
): Promise<string | null> {
  const lead = await prisma.growthLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      leadType: true,
      publicListings: {
        where: { removedAt: null },
        select: { slug: true, claimStatus: true, verificationStatus: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });
  if (!lead) return null;
  return buildGrowthLeadClickDestination(lead);
}
