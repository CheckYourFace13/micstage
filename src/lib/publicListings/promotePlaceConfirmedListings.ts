import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import {
  evaluateOpenMicEvidence,
  extractDiscoverySnippet,
  OPEN_MIC_EVIDENCE_REASON,
  type OpenMicEvidenceInput,
} from "@/lib/publicListings/openMicEvidence";
import { classifyListingName, isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";
import { submitUrlsToIndexNow } from "@/lib/seo/searchEnginePing";

export type PromotePlaceConfirmedResult = {
  scanned: number;
  promoted: number;
  skippedNoTrustedEvidence: number;
  skippedNonVenueName: number;
  junkOutdated: number;
  claimInvitesAttempted: number;
};

function listingPromotePerDiscoveryRun(): number {
  return Math.min(100, Math.max(0, parseIntEnv("LISTING_PROMOTE_PLACE_CONFIRMED_PER_RUN", 40)));
}

function appendNote(existing: string | null | undefined, reason: string): string {
  const line = `[${new Date().toISOString().slice(0, 10)}] promote: ${reason}`;
  const base = existing?.trim();
  return base ? `${base}\n${line}` : line;
}

function buildEvidenceInput(row: {
  name: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  schedules: Array<{ title: string | null; description: string | null }>;
  growthLead: { sourceKind: string | null; internalNotes: string | null; discoveryHints: unknown } | null;
}): OpenMicEvidenceInput {
  return {
    listingName: row.name,
    schedules: row.schedules,
    sourceSnippet: extractDiscoverySnippet(row.growthLead?.internalNotes),
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: row.growthLead?.sourceKind ?? null,
  };
}

/**
 * Promote place-confirmed NEEDS_REVIEW listings to VERIFIED when trusted open-mic evidence exists.
 * Same safety rules as `scripts/promote-reviewed-open-mic-listings.mjs` — runs on discovery cron.
 */
export async function promotePlaceConfirmedListings(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<PromotePlaceConfirmedResult> {
  const limit = opts?.limit ?? listingPromotePerDiscoveryRun();
  if (limit <= 0) {
    return {
      scanned: 0,
      promoted: 0,
      skippedNoTrustedEvidence: 0,
      skippedNonVenueName: 0,
      junkOutdated: 0,
      claimInvitesAttempted: 0,
    };
  }

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: "NEEDS_REVIEW",
      googlePlaceId: { not: null },
      googlePlaceVerifiedAt: { not: null },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      internalNotes: true,
      sourceUrl: true,
      websiteUrl: true,
      schedules: { select: { title: true, description: true } },
      growthLead: { select: { sourceKind: true, internalNotes: true, discoveryHints: true } },
    },
  });

  let promoted = 0;
  let skippedNoTrustedEvidence = 0;
  let skippedNonVenueName = 0;
  let junkOutdated = 0;
  let claimInvitesAttempted = 0;
  const indexUrls: string[] = [];
  const base = appBaseUrl().replace(/\/$/, "");

  for (const row of rows) {
    const nameReject = classifyListingName(row.name);
    if (nameReject) {
      skippedNonVenueName += 1;
      junkOutdated += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          evidenceTerminalReason: `JUNK_NAME_${nameReject}`.slice(0, 80),
          internalNotes: appendNote(row.internalNotes, `auto-reject JUNK_NAME_${nameReject}`),
        },
      });
      continue;
    }

    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    if (!evidence.trusted) {
      skippedNoTrustedEvidence += 1;
      continue;
    }
    if (!isPublicListingNameOk(row.name)) {
      skippedNonVenueName += 1;
      continue;
    }

    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
        internalNotes: appendNote(
          row.internalNotes,
          `auto-promote ${OPEN_MIC_EVIDENCE_REASON.CONFIRMED} (${evidence.field}: "${evidence.snippet}"); place identity confirmed`,
        ),
      },
    });
    promoted += 1;
    indexUrls.push(`${base}/open-mics/${encodeURIComponent(row.slug)}`);

    claimInvitesAttempted += 1;
    await sendListingClaimInviteIfNeeded(prisma, row.id).catch((e) => {
      console.error("[promotePlaceConfirmed] claim invite failed", {
        listingId: row.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }

  if (indexUrls.length > 0) {
    await submitUrlsToIndexNow(indexUrls).catch((e) => {
      console.warn("[promotePlaceConfirmed] IndexNow ping failed", e instanceof Error ? e.message : e);
    });
  }

  return {
    scanned: rows.length,
    promoted,
    skippedNoTrustedEvidence,
    skippedNonVenueName,
    junkOutdated,
    claimInvitesAttempted,
  };
}
