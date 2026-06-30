import type {
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  PrismaClient,
  PublicListingVerificationStatus,
} from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { buildListingAboutFromLead } from "@/lib/publicListings/listingAboutFromLead";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

export async function publishGrowthLeadAsListing(
  prisma: PrismaClient,
  lead: {
    id: string;
    name: string;
    city: string | null;
    suburb: string | null;
    region: string | null;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    tiktokUrl: string | null;
    youtubeUrl: string | null;
    source: string | null;
    openMicSignalTier: GrowthLeadOpenMicSignalTier | null;
    contactEmailNormalized: string | null;
    contactUrl?: string | null;
    performanceTags?: GrowthLeadPerformanceTag[];
    internalNotes?: string | null;
    discoveryHints?: unknown;
  },
  existingSlugs: Set<string>,
): Promise<{ created: boolean; slug?: string; inviteSent?: boolean }> {
  const city = (lead.city ?? lead.suburb ?? "").trim();
  const baseName = lead.name.trim();
  if (!baseName || !isPublicListingNameOk(baseName)) return { created: false };

  const slugBase =
    slugify(city ? `${baseName}-${city}` : baseName) || slugify(baseName) || `listing-${lead.id.slice(0, 8)}`;
  const slug = uniqueSlug(slugBase, existingSlugs);

  const formattedAddress = [baseName, city, lead.region].filter(Boolean).join(", ") || baseName;
  const verificationStatus: PublicListingVerificationStatus =
    lead.openMicSignalTier === "EXPLICIT_OPEN_MIC" ? "VERIFIED" : "NEEDS_REVIEW";

  const about = buildListingAboutFromLead({
    openMicSignalTier: lead.openMicSignalTier,
    performanceTags: lead.performanceTags ?? [],
    internalNotes: lead.internalNotes ?? null,
    discoveryHints: lead.discoveryHints ?? null,
    source: lead.source,
  });

  const listing = await prisma.publicOpenMicListing.create({
    data: {
      name: baseName,
      slug,
      formattedAddress,
      city: city || null,
      region: lead.region,
      country: "US",
      websiteUrl: lead.websiteUrl,
      facebookUrl: lead.facebookUrl,
      instagramUrl: lead.instagramUrl,
      tiktokUrl: lead.tiktokUrl,
      youtubeUrl: lead.youtubeUrl,
      sourceUrl: lead.contactUrl?.trim() || null,
      sourceName: lead.source ?? "MicStage growth discovery",
      verificationStatus,
      lastVerifiedAt: new Date(),
      growthLeadId: lead.id,
      about,
      internalNotes: `Auto-published from growth lead ${lead.id}`,
    },
  });

  const invite = await sendListingClaimInviteIfNeeded(
    prisma,
    listing.id,
    lead.contactEmailNormalized,
  );

  return { created: true, slug, inviteSent: invite.sent };
}
