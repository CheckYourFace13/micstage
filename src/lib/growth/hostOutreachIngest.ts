/**
 * Ingest host/promoter leads discovered from venue open-mic evidence (second autonomous lane).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { extractHostOrganizersFromPage } from "@/lib/growth/discovery/hostOrganizerExtraction";
import { extractHostIdentityFromEvidence } from "@/lib/growth/hostIdentityExtraction";
import { ingestHostLaneLeadCandidate } from "@/lib/growth/hostLeadIngest";
import { tagHostMultiVenueProspect } from "@/lib/growth/hostMultiVenueProspect";
import { hostNameDuplicatesVenue, hostNamesMatch, isUsableHostName } from "@/lib/growth/hostNameQuality";
import { HOST_OUTREACH_CTA_PATH } from "@/lib/growth/hostOutreachSignals";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";

/** Host identities created per venue evidence page. One page rarely reveals more than a couple. */
const MAX_HOST_LEADS_PER_EVIDENCE_PAGE = 2;

type HostSeed = {
  name: string;
  websiteUrl: string | null;
  email: string | null;
  method: string;
  confidence: number;
  evidenceSnippet: string;
};

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
    region?: string | null;
    /** The venue's own site — a host must never inherit it as its contact domain. */
    venueWebsiteUrl?: string | null;
    /** Evidence page HTML when the crawler still holds it: the only way to capture host links. */
    sourceHtml?: string | null;
  },
): Promise<{ created: boolean; hostBrand: string | null; hostLeadIds: string[] }> {
  const extracted = extractHostIdentityFromEvidence({
    name: input.name,
    snippet: input.snippet,
    eventName: input.eventName,
    sourceUrl: input.sourceUrl,
  });
  if (!extracted) return { created: false, hostBrand: null, hostLeadIds: [] };

  const hostHints = {
    hostOutreachLane: true,
    hostBrand: extracted.hostBrand,
    hostPersonName: extracted.hostPersonName,
    evidenceSnippet: extracted.evidenceSnippet,
    hostCtaPath: HOST_OUTREACH_CTA_PATH,
  };

  // The venue lead keeps the host hints either way: they are what the multi-venue sweep groups on.
  await mergeVenueDiscoveryHints(prisma, input.venueLeadId, hostHints);

  /**
   * The host's own link is what makes an emailless lead worth creating: enrichment mines a mailbox
   * from the host's domain, never from the venue's. Structured organizer data on the evidence page
   * is the only place that link comes from, so hosts without one stay hints on the venue lead.
   */
  const organizers =
    input.sourceHtml && input.sourceUrl
      ? extractHostOrganizersFromPage({
          pageUrl: input.sourceUrl,
          html: input.sourceHtml,
          venueName: input.name,
          maxCandidates: MAX_HOST_LEADS_PER_EVIDENCE_PAGE,
        }).candidates
      : [];

  const seeds: HostSeed[] = organizers.map((o) => ({
    name: o.name,
    websiteUrl: o.websiteUrl,
    email: o.email,
    method: o.method,
    confidence: o.confidence,
    evidenceSnippet: o.evidenceSnippet,
  }));

  const alreadySeeded = seeds.some((s) => hostNamesMatch(s.name, extracted.hostBrand));
  if (
    !alreadySeeded &&
    isUsableHostName(extracted.hostBrand) &&
    !hostNameDuplicatesVenue(extracted.hostBrand, input.name)
  ) {
    seeds.push({
      name: extracted.hostBrand,
      websiteUrl: null,
      email: input.contactEmail?.trim() || null,
      method: "evidence_snippet",
      confidence: 50,
      evidenceSnippet: extracted.evidenceSnippet,
    });
  }

  const hostLeadIds: string[] = [];
  let created = false;

  for (const seed of seeds.slice(0, MAX_HOST_LEADS_PER_EVIDENCE_PAGE)) {
    const email = seed.email || input.contactEmail?.trim() || null;
    const candidate: GrowthLeadCandidate = {
      leadType: "PROMOTER_ACCOUNT",
      name: seed.name,
      city: input.city ?? undefined,
      region: input.region ?? undefined,
      discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
      // With a mailbox in hand the evidence page is a usable record; without one we must crawl the
      // host's own site, so only a host-attributed link qualifies.
      websiteUrl: seed.websiteUrl ?? (email ? input.sourceUrl : null),
      contactEmailNormalized: email,
      sourceKind: "EVENT_LISTING",
      source: "host_evidence_extraction",
      openMicSignalTier: "EXPLICIT_OPEN_MIC",
      discoveryHints: {
        ...hostHints,
        hostBrand: seed.name,
        extractedFromVenueLeadId: input.venueLeadId,
        evidenceReason: extracted.evidenceReason,
        hostIdentityMethod: seed.method,
        hostIdentityConfidence: seed.confidence,
        hostEvidenceSourceUrl: input.sourceUrl,
        evidenceSnippet: seed.evidenceSnippet,
      },
    };

    const result = await ingestHostLaneLeadCandidate(prisma, candidate, {
      excludeWebsiteHosts: [input.venueWebsiteUrl, email ? null : input.sourceUrl],
    });
    const promoterLeadId =
      result.status === "created" ? result.id : result.status === "duplicate" ? result.existingId : null;
    if (result.status === "created") created = true;
    if (promoterLeadId) hostLeadIds.push(promoterLeadId);

    await tagHostMultiVenueProspect(prisma, {
      hostBrand: seed.name,
      venueLeadId: input.venueLeadId,
      promoterLeadId,
      city: input.city,
    });
  }

  if (seeds.length === 0) {
    await tagHostMultiVenueProspect(prisma, {
      hostBrand: extracted.hostBrand,
      venueLeadId: input.venueLeadId,
      city: input.city,
    });
  }

  return { created, hostBrand: extracted.hostBrand, hostLeadIds };
}
