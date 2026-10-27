/**
 * Resolve first-party click destinations for growth outreach sends.
 */
import type { GrowthLead, PublicOpenMicListing } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

type LeadForDestination = Pick<GrowthLead, "id" | "leadType"> & {
  contactEmailNormalized?: string | null;
  name?: string | null;
  publicListings?: Pick<PublicOpenMicListing, "slug" | "claimStatus" | "verificationStatus">[];
};

function withPrefill(url: string, lead: LeadForDestination): string {
  try {
    const u = new URL(url);
    const email = lead.contactEmailNormalized?.trim();
    if (email && !u.searchParams.get("email")) u.searchParams.set("email", email);
    const name = lead.name?.trim();
    if (name && lead.leadType === "PROMOTER_ACCOUNT" && !u.searchParams.get("displayName")) {
      u.searchParams.set("displayName", name);
    }
    if (name && lead.leadType === "ARTIST" && !u.searchParams.get("stageName")) {
      u.searchParams.set("stageName", name);
    }
    return u.toString();
  } catch {
    return url;
  }
}

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
    return withPrefill(`${baseUrl}/host?growthLead=${encodeURIComponent(lead.id)}`, lead);
  }
  if (lead.leadType === "ARTIST") {
    return withPrefill(`${baseUrl}/register/musician?growthLead=${encodeURIComponent(lead.id)}`, lead);
  }

  if (listingRow?.slug && listingRow.verificationStatus === "VERIFIED") {
    return withPrefill(
      `${baseUrl}/claim/${encodeURIComponent(listingRow.slug)}?growthLead=${encodeURIComponent(lead.id)}`,
      lead,
    );
  }
  if (listingRow?.slug) {
    return withPrefill(
      `${baseUrl}/open-mics/${encodeURIComponent(listingRow.slug)}?growthLead=${encodeURIComponent(lead.id)}`,
      lead,
    );
  }
  return withPrefill(`${baseUrl}/register/venue?growthLead=${encodeURIComponent(lead.id)}`, lead);
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
      name: true,
      contactEmailNormalized: true,
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
