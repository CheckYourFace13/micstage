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
  isNonVenueEvidenceHost,
  listingHasGeoConflict,
  LISTING_EVIDENCE_REASON,
} from "@/lib/publicListings/evidenceTrust";

export function listingEvidenceEnrichPerRun(): number {
  return Math.min(50, Math.max(0, parseIntEnv("LISTING_EVIDENCE_ENRICH_PER_RUN", 30)));
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

/** Common event/calendar paths on venue sites — follow after homepage when needed. */
const EVENT_PATH_SUFFIXES = [
  "/events",
  "/calendar",
  "/music",
  "/live-music",
  "/open-mic",
  "/openmic",
  "/entertainment",
  "/whats-on",
  "/schedule",
  "/weekly-events",
  "/events/",
  "/calendar/",
];

function originOf(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.origin;
  } catch {
    return null;
  }
}

/** Expand a venue homepage into homepage + likely event/calendar URLs (same origin). */
export function expandOfficialEvidenceUrls(seedUrls: string[], maxUrls = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of seedUrls) {
    const u = raw.trim();
    if (!u) continue;
    const key = u.replace(/\/$/, "").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(u);
    }
    const origin = originOf(u);
    if (!origin) continue;
    for (const suffix of EVENT_PATH_SUFFIXES) {
      const candidate = `${origin}${suffix}`;
      const ck = candidate.replace(/\/$/, "").toLowerCase();
      if (seen.has(ck)) continue;
      seen.add(ck);
      out.push(candidate);
      if (out.length >= maxUrls) return out;
    }
  }
  return out.slice(0, maxUrls);
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

    const rawVenueHost =
      hostFromUrl(row.websiteUrl) || hostFromUrl(row.growthLead?.websiteUrl) || hostFromUrl(row.sourceUrl);
    // Never treat ticket/directory hosts as the venue's official domain.
    const venueHost = rawVenueHost && !isNonVenueEvidenceHost(rawVenueHost) ? rawVenueHost : null;
    const seedUrls = [row.websiteUrl, row.growthLead?.websiteUrl, row.sourceUrl].filter(
      (u): u is string => Boolean(u?.trim()) && !isNonVenueEvidenceHost(u),
    );
    // Follow homepage + /events|/calendar|/open-mic etc. on the official origin.
    const uniqueUrls = expandOfficialEvidenceUrls(seedUrls, 6);
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
    let fetchFailures = 0;
    for (const url of uniqueUrls) {
      try {
        const text = await discoveryFetchText(url);
        if (!text) {
          fetchFailures += 1;
          continue;
        }
        const excerpt = excerptAroundMatch(text);
        const pageHost = hostFromUrl(url);
        const pageIsNonVenue = isNonVenueEvidenceHost(pageHost);
        const onOfficial = Boolean(
          !pageIsNonVenue && pageHost && venueHost && hostsRelated(pageHost, venueHost),
        );
        // Ticket/third-party hosts are never treated as official venue domain.
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

        // Promote only when fetch trust AND listing-level evidence gate agree,
        // after persisting the official source URL + structured title (not raw SERP).
        if (trust.trusted && onOfficial && excerpt) {
          const gate = evaluateOpenMicEvidence({
            listingName: row.name,
            schedules: row.schedules,
            sourceTitle: excerpt,
            sourceUrl: url,
            websiteUrl: row.websiteUrl ?? row.growthLead?.websiteUrl,
            sourceKind: "WEBSITE_CONTACT",
          });
          if (gate.trusted) {
            await prisma.publicOpenMicListing.update({
              where: { id: row.id },
              data: {
                verificationStatus: "VERIFIED",
                lastVerifiedAt: new Date(),
                sourceUrl: url,
                sourceName: `Enrichment ${trust.reasonCode}`,
                evidenceAutomationStatus: "PROMOTED",
                evidenceTerminalReason: null,
                internalNotes: [
                  row.internalNotes,
                  OPEN_MIC_EVIDENCE_REASON.CONFIRMED,
                  `ENRICHMENT_TRUSTED ${trust.reasonCode}`,
                  `evidenceUrl=${url}`,
                  `evidenceSnippet=${excerpt.slice(0, 200)}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
              select: { id: true },
            });
            storedTrusted = true;
            promoted += 1;
            void sendListingClaimInviteIfNeeded(prisma, row.id).catch(() => undefined);
            break;
          }
        }
      } catch {
        fetchFailures += 1;
      }
    }

    if (storedTrusted) {
      // already promoted inside the fetch loop
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
