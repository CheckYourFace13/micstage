import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { buildListingAboutFromLead } from "@/lib/publicListings/listingAboutFromLead";
import {
  listingGoogleVerifyPerDiscoveryRun,
  verifyPublicListingsWithGoogle,
} from "@/lib/publicListings/googlePlacesVerify";
import { publishGrowthLeadAsListing } from "@/lib/publicListings/publishGrowthLeadListing";

export type AutoPublishListingsResult = {
  published: number;
  invitesSent: number;
  enriched: number;
  skipped: number;
  backlogRemaining: number;
  googleVerify: {
    verified: number;
    needsReview: number;
    outdated: number;
    skipped: number;
    noApiKey: boolean;
  };
};

const LEAD_PUBLISH_WHERE = {
  leadType: "VENUE" as const,
  openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] as ("EXPLICIT_OPEN_MIC" | "STRONG_LIVE_EVENT")[] },
  NOT: { publicListings: { some: {} } },
};

export function listingAutoPublishPerDiscoveryRun(): number {
  return Math.min(50, Math.max(1, parseIntEnv("LISTING_AUTO_PUBLISH_PER_DISCOVERY_RUN", 15)));
}

export function listingEnrichFromLeadPerDiscoveryRun(): number {
  return Math.min(25, Math.max(0, parseIntEnv("LISTING_ENRICH_FROM_LEAD_PER_RUN", 10)));
}

async function enrichListingsFromGrowthLeads(
  prisma: PrismaClient,
  limit: number,
): Promise<number> {
  if (limit <= 0) return 0;

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      growthLeadId: { not: null },
      OR: [{ about: null }, { about: "" }],
    },
    select: {
      id: true,
      about: true,
      websiteUrl: true,
      sourceUrl: true,
      growthLead: {
        select: {
          openMicSignalTier: true,
          performanceTags: true,
          internalNotes: true,
          discoveryHints: true,
          source: true,
          websiteUrl: true,
          contactUrl: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let enriched = 0;
  for (const row of rows) {
    const lead = row.growthLead;
    if (!lead) continue;

    const about = buildListingAboutFromLead(lead);
    const data: {
      about?: string;
      websiteUrl?: string;
      sourceUrl?: string;
    } = {};

    if (about && !row.about?.trim()) data.about = about;
    if (!row.websiteUrl?.trim() && lead.websiteUrl?.trim()) {
      data.websiteUrl = lead.websiteUrl.trim();
    }
    if (!row.sourceUrl?.trim() && lead.contactUrl?.trim()) {
      data.sourceUrl = lead.contactUrl.trim();
    }

    if (Object.keys(data).length === 0) continue;
    await prisma.publicOpenMicListing.update({ where: { id: row.id }, data });
    enriched += 1;
  }

  return enriched;
}

/**
 * Publish eligible growth leads as public listings and backfill `about` on sparse rows.
 * Called from the growth discovery cron so inventory grows without manual scripts.
 */
export async function autoPublishGrowthLeadsAsListings(
  prisma: PrismaClient,
  opts?: { publishLimit?: number; enrichLimit?: number },
): Promise<AutoPublishListingsResult> {
  const publishLimit = opts?.publishLimit ?? listingAutoPublishPerDiscoveryRun();
  const enrichLimit = opts?.enrichLimit ?? listingEnrichFromLeadPerDiscoveryRun();

  const existingSlugs = new Set(
    (await prisma.publicOpenMicListing.findMany({ select: { slug: true } })).map((r) => r.slug),
  );

  const leads = await prisma.growthLead.findMany({
    where: LEAD_PUBLISH_WHERE,
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: publishLimit,
    select: {
      id: true,
      name: true,
      city: true,
      suburb: true,
      region: true,
      websiteUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
      source: true,
      openMicSignalTier: true,
      contactEmailNormalized: true,
      contactUrl: true,
      performanceTags: true,
      internalNotes: true,
      discoveryHints: true,
    },
  });

  let published = 0;
  let invitesSent = 0;
  let skipped = 0;

  for (const lead of leads) {
    const result = await publishGrowthLeadAsListing(prisma, lead, existingSlugs);
    if (result.created) {
      published += 1;
      if (result.inviteSent) invitesSent += 1;
    } else {
      skipped += 1;
    }
  }

  const enriched = await enrichListingsFromGrowthLeads(prisma, enrichLimit);
  const backlogRemaining = await prisma.growthLead.count({ where: LEAD_PUBLISH_WHERE });
  const googleVerify = await verifyPublicListingsWithGoogle(prisma, {
    limit: listingGoogleVerifyPerDiscoveryRun(),
  });

  return { published, invitesSent, enriched, skipped, backlogRemaining, googleVerify };
}
