/**
 * Deep evidence enrichment for NEEDS_REVIEW listings missing trusted open-mic evidence.
 * Official-domain hosting alone never auto-promotes.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { evaluateOpenMicEvidence, OPEN_MIC_EVIDENCE_REASON } from "@/lib/publicListings/openMicEvidence";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";
import { micstagePromotionKillSwitch } from "@/lib/publicListings/automationKillSwitches";
import {
  detectExplicitPhrase,
  evaluateFetchedEvidenceTrust,
  excerptAroundMatch,
  listingHasGeoConflict,
  LISTING_EVIDENCE_REASON,
} from "@/lib/publicListings/evidenceTrust";

export function listingEvidenceEnrichPerRun(): number {
  return Math.min(40, Math.max(0, parseIntEnv("LISTING_EVIDENCE_ENRICH_PER_RUN", 20)));
}

function hostFromUrl(u: string | null | undefined): string | null {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostsRelated(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export type EvidenceEnrichBatchResult = {
  processed: number;
  evidenceStored: number;
  promoted: number;
  rejected: number;
  skipped: number;
};

export async function enrichListingsMissingTrustedEvidence(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<EvidenceEnrichBatchResult> {
  if (micstagePromotionKillSwitch()) {
    return { processed: 0, evidenceStored: 0, promoted: 0, rejected: 0, skipped: 0 };
  }

  const limit = opts?.limit ?? listingEvidenceEnrichPerRun();
  if (limit <= 0) {
    return { processed: 0, evidenceStored: 0, promoted: 0, rejected: 0, skipped: 0 };
  }

  const now = new Date();
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "NEEDS_REVIEW",
      claimedVenueId: null,
      googlePlaceId: { not: null },
      googlePlaceVerifiedAt: { not: null },
      OR: [{ evidenceEnrichNextAttemptAt: null }, { evidenceEnrichNextAttemptAt: { lte: now } }],
      evidenceAutomationStatus: { in: ["PENDING", "IN_PROGRESS", "NEEDS_HUMAN"] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      googlePlaceVerifiedAt: true,
      internalNotes: true,
      evidenceEnrichAttemptCount: true,
      schedules: { select: { title: true, description: true } },
      growthLead: {
        select: {
          sourceKind: true,
          discoveryHints: true,
          internalNotes: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { evidenceEnrichAttemptCount: "asc" }],
    take: limit,
  });

  let processed = 0;
  let evidenceStored = 0;
  let promoted = 0;
  let rejected = 0;
  let skipped = 0;

  for (const row of rows) {
    processed += 1;
    const attempt = (row.evidenceEnrichAttemptCount ?? 0) + 1;
    const backoffHours = Math.min(72, Math.max(2, attempt * 2));
    const geoConflict = listingHasGeoConflict({
      region: row.region,
      city: row.city,
      formattedAddress: row.formattedAddress,
      name: row.name,
      discoveryMarketSlug: row.growthLead?.discoveryMarketSlug,
    });
    const nameOk = isPublicListingNameOk(row.name);
    const placeStrong = Boolean(row.googlePlaceId && row.googlePlaceVerifiedAt);

    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        evidenceEnrichAttemptCount: attempt,
        evidenceEnrichLastAttemptAt: now,
        evidenceEnrichNextAttemptAt: new Date(Date.now() + backoffHours * 3600 * 1000),
        evidenceAutomationStatus: "IN_PROGRESS",
      },
      select: { id: true },
    });

    if (geoConflict) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          evidenceAutomationStatus: "NEEDS_HUMAN",
          evidenceTerminalReason: LISTING_EVIDENCE_REASON.PLACE_OR_REGION_CONFLICT,
          internalNotes: [row.internalNotes, LISTING_EVIDENCE_REASON.PLACE_OR_REGION_CONFLICT]
            .filter(Boolean)
            .join("\n"),
        },
        select: { id: true },
      });
      skipped += 1;
      continue;
    }

    if (!nameOk) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          evidenceAutomationStatus: "REJECTED",
          evidenceTerminalReason: "NAME_CLASSIFIER_BLOCKED",
        },
        select: { id: true },
      });
      rejected += 1;
      continue;
    }

    const preexisting = evaluateOpenMicEvidence({
      listingName: row.name,
      schedules: row.schedules,
      sourceSnippet: null,
      sourceUrl: row.sourceUrl,
      websiteUrl: row.websiteUrl ?? row.growthLead?.websiteUrl,
      discoveryHints: row.growthLead?.discoveryHints,
      sourceKind: row.growthLead?.sourceKind ?? null,
    });
    if (preexisting.trusted && placeStrong) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "VERIFIED",
          lastVerifiedAt: new Date(),
          evidenceAutomationStatus: "PROMOTED",
          internalNotes: [row.internalNotes, OPEN_MIC_EVIDENCE_REASON.CONFIRMED].filter(Boolean).join("\n"),
        },
        select: { id: true },
      });
      promoted += 1;
      void sendListingClaimInviteIfNeeded(prisma, row.id).catch(() => undefined);
      continue;
    }

    const venueHost =
      hostFromUrl(row.websiteUrl) || hostFromUrl(row.growthLead?.websiteUrl) || hostFromUrl(row.sourceUrl);
    const urls = [row.websiteUrl, row.growthLead?.websiteUrl, row.sourceUrl].filter(
      (u): u is string => Boolean(u?.trim()),
    );
    const uniqueUrls = [...new Set(urls.map((u) => u.trim()))].slice(0, 3);
    if (uniqueUrls.length === 0) {
      skipped += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          evidenceAutomationStatus: "NEEDS_HUMAN",
          evidenceTerminalReason: LISTING_EVIDENCE_REASON.NO_TRUSTED_EVIDENCE,
        },
        select: { id: true },
      });
      continue;
    }

    let storedTrusted = false;
    for (const url of uniqueUrls) {
      try {
        const text = await discoveryFetchText(url);
        if (!text) continue;
        const excerpt = excerptAroundMatch(text);
        const pageHost = hostFromUrl(url);
        const onOfficial = Boolean(pageHost && venueHost && hostsRelated(pageHost, venueHost));
        const trust = evaluateFetchedEvidenceTrust({
          pageText: text,
          excerpt,
          onOfficialVenueDomain: onOfficial,
          sourceKind: onOfficial ? "official_website" : "third_party",
          placeIdentityStrong: placeStrong,
          geoConflict: false,
          nameOk: true,
        });

        await prisma.listingOpenMicEvidence.upsert({
          where: { listingId_evidenceUrl: { listingId: row.id, evidenceUrl: url } },
          create: {
            listingId: row.id,
            evidenceUrl: url,
            sourceType: onOfficial ? "OFFICIAL_WEBSITE" : "OTHER",
            evidenceExcerpt: excerpt,
            detectedPhrase: excerpt ? detectExplicitPhrase(excerpt) : null,
            authorityScore: trust.authorityScore,
            currentnessScore: trust.currentnessScore,
            trusted: trust.trusted,
            reviewOnly: trust.reviewOnly,
            reasonCode: trust.reasonCode,
          },
          update: {
            evidenceExcerpt: excerpt,
            detectedPhrase: excerpt ? detectExplicitPhrase(excerpt) : null,
            authorityScore: trust.authorityScore,
            currentnessScore: trust.currentnessScore,
            trusted: trust.trusted,
            reviewOnly: trust.reviewOnly,
            reasonCode: trust.reasonCode,
            fetchedAt: new Date(),
          },
        });
        evidenceStored += 1;
        if (trust.trusted) storedTrusted = true;
      } catch {
        // continue
      }
    }

    if (storedTrusted) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "VERIFIED",
          lastVerifiedAt: new Date(),
          evidenceAutomationStatus: "PROMOTED",
          internalNotes: [row.internalNotes, OPEN_MIC_EVIDENCE_REASON.CONFIRMED, "ENRICHMENT_TRUSTED"].filter(Boolean).join("\n"),
        },
        select: { id: true },
      });
      promoted += 1;
      void sendListingClaimInviteIfNeeded(prisma, row.id).catch(() => undefined);
    } else if (attempt >= 5) {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          evidenceAutomationStatus: "NEEDS_HUMAN",
          evidenceTerminalReason: LISTING_EVIDENCE_REASON.NO_TRUSTED_EVIDENCE,
        },
        select: { id: true },
      });
    }
  }

  return { processed, evidenceStored, promoted, rejected, skipped };
}
