import type { PrismaClient, PublicListingVerificationStatus } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";

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

const JUNK_NAME =
  /\b(karaoke|trivia|best bars|nightlife guide|review:|must-chicago|bandmix|pub trivia|private events|how to|blog|list of all)\b/i;

function looksLikeOpenMic(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 3) return false;
  if (JUNK_NAME.test(n)) return false;
  if (/^home(-\d+)?$/i.test(n)) return false;
  return true;
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
    openMicSignalTier: string | null;
    contactEmailNormalized: string | null;
  },
  existingSlugs: Set<string>,
): Promise<{ created: boolean; slug?: string; inviteSent?: boolean }> {
  const city = (lead.city ?? lead.suburb ?? "").trim();
  const baseName = lead.name.trim();
  if (!baseName || !looksLikeOpenMic(baseName)) return { created: false };

  const slugBase =
    slugify(city ? `${baseName}-${city}` : baseName) || slugify(baseName) || `listing-${lead.id.slice(0, 8)}`;
  const slug = uniqueSlug(slugBase, existingSlugs);

  const formattedAddress = [baseName, city, lead.region].filter(Boolean).join(", ") || baseName;
  const verificationStatus: PublicListingVerificationStatus =
    lead.openMicSignalTier === "EXPLICIT_OPEN_MIC" ? "VERIFIED" : "NEEDS_REVIEW";

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
      sourceName: lead.source ?? "MicStage growth discovery",
      verificationStatus,
      lastVerifiedAt: new Date(),
      growthLeadId: lead.id,
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
