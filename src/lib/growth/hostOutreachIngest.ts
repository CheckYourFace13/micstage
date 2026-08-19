/**
 * Ingest host/promoter leads discovered from venue open-mic evidence (second autonomous lane).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { extractHostIdentityFromEvidence } from "@/lib/growth/hostIdentityExtraction";
import { HOST_OUTREACH_CTA_PATH } from "@/lib/growth/hostOutreachSignals";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";

export async function ingestHostLeadFromVenueEvidence(
  prisma: PrismaClient,
  input: {
    venueLeadId: string;
    name: string;
    snippet: string | null;
    eventName: string | null;
    sourceUrl: string | null;
    city: string | null;
    discoveryMarketSlug: string | null;
    contactEmail?: string | null;
  },
): Promise<{ created: boolean; hostBrand: string | null }> {
  const extracted = extractHostIdentityFromEvidence({
    name: input.name,
    snippet: input.snippet,
    eventName: input.eventName,
    sourceUrl: input.sourceUrl,
  });
  if (!extracted) return { created: false, hostBrand: null };

  if (!input.contactEmail?.trim()) {
    await mergeVenueDiscoveryHints(prisma, input.venueLeadId, {
      hostOutreachLane: true,
      hostBrand: extracted.hostBrand,
      hostPersonName: extracted.hostPersonName,
      evidenceSnippet: extracted.evidenceSnippet,
      hostCtaPath: HOST_OUTREACH_CTA_PATH,
    });
    return { created: false, hostBrand: extracted.hostBrand };
  }

  const result = await ingestGrowthLeadCandidate(prisma, {
    leadType: "PROMOTER_ACCOUNT",
    name: extracted.hostBrand,
    city: input.city ?? undefined,
    discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
    websiteUrl: input.sourceUrl,
    contactEmailNormalized: input.contactEmail,
    sourceKind: "EVENT_LISTING",
    source: "host_evidence_extraction",
    discoveryHints: {
      hostOutreachLane: true,
      hostCtaPath: HOST_OUTREACH_CTA_PATH,
      extractedFromVenueLeadId: input.venueLeadId,
      hostPersonName: extracted.hostPersonName,
      evidenceSnippet: extracted.evidenceSnippet,
      evidenceReason: extracted.evidenceReason,
    },
  });

  return {
    created: result.status === "created",
    hostBrand: extracted.hostBrand,
  };
}
