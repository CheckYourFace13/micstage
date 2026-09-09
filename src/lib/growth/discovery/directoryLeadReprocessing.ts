/**
 * Gradual repair of leads created before discovery resolved real identities.
 *
 * Historic runs turned article and directory page titles into "venues". For each such lead this
 * crawls the page, extracts the real venues named on it, verifies them against Google Places,
 * creates those venue leads, and only then retires the page itself as a non-target. Pages that
 * are genuinely a venue's own site are kept — a name we could not read is not a reason to
 * discard a real target. Nothing is deleted: the original lead keeps its evidence and notes.
 *
 * Runs inside the growth tick with a small page budget and shares the daily Places budget, so
 * the backlog drains over days without a manual script.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import {
  extractVenueCandidatesFromPage,
  isUsableVenueName,
} from "@/lib/growth/discovery/venueCandidateExtraction";
import {
  createPlaceLookupBudget,
  placeResolutionIsUsable,
  resolveVenueCandidateWithPlaces,
} from "@/lib/growth/discovery/venuePlaceResolution";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import { isDirectoryHost, isDirectoryListingPath } from "@/lib/growth/outreachTargetIdentity";

/** Venues extracted per directory page. A listicle names many; we take the strongest few. */
const MAX_VENUES_PER_PAGE = 8;

export type DirectoryLeadReprocessResult = {
  pagesProcessed: number;
  pagesUnfetchable: number;
  venueCandidatesExtracted: number;
  placeLookupsSpent: number;
  placeCacheHits: number;
  venueLeadsCreated: number;
  venueLeadsDuplicate: number;
  venueLeadsSkipped: number;
  directoryLeadsRetired: number;
  keptForIdentityRetry: number;
  backlogRemaining: number;
};

function emptyResult(backlogRemaining = 0): DirectoryLeadReprocessResult {
  return {
    pagesProcessed: 0,
    pagesUnfetchable: 0,
    venueCandidatesExtracted: 0,
    placeLookupsSpent: 0,
    placeCacheHits: 0,
    venueLeadsCreated: 0,
    venueLeadsDuplicate: 0,
    venueLeadsSkipped: 0,
    directoryLeadsRetired: 0,
    keptForIdentityRetry: 0,
    backlogRemaining,
  };
}

export function directoryReprocessPagesPerRun(): number {
  const raw = Number.parseInt(process.env.DISCOVERY_REPROCESS_PAGES_PER_RUN ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(40, raw);
  return 6;
}

export async function runDirectoryLeadReprocessing(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<DirectoryLeadReprocessResult> {
  const pageLimit = opts?.limit ?? directoryReprocessPagesPerRun();
  if (pageLimit <= 0) return emptyResult();

  const budget = await createPlaceLookupBudget(prisma);
  if (budget.remaining <= 0) return emptyResult();

  /**
   * Bad identities are recognised by name or host, neither of which is indexable, so scan a
   * bounded window of the oldest active venue leads rather than the whole table.
   */
  const scanWindow = await prisma.growthLead.findMany({
    where: {
      leadType: "VENUE",
      status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
      websiteUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      websiteHostNormalized: true,
      city: true,
      region: true,
      discoveryMarketSlug: true,
      openMicSignalTier: true,
      internalNotes: true,
      _count: { select: { outreachDrafts: true } },
      publicListings: { where: { removedAt: null }, select: { claimStatus: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 400,
  });

  const backlog = scanWindow.filter((lead) => {
    const badName = !isUsableVenueName(lead.name);
    const badHost = isDirectoryHost(lead.websiteHostNormalized) || isDirectoryListingPath(lead.websiteUrl);
    if (!badName && !badHost) return false;
    // Leads with outreach history or a claimed listing are left untouched.
    if (lead._count.outreachDrafts > 0) return false;
    return !lead.publicListings.some((l) => l.claimStatus !== "UNCLAIMED");
  });

  const result = emptyResult(Math.max(0, backlog.length - pageLimit));

  for (const lead of backlog.slice(0, pageLimit)) {
    if (budget.remaining <= 0) break;

    const pageUrl = lead.websiteUrl;
    const html = pageUrl ? await discoveryFetchText(pageUrl) : null;
    if (!pageUrl || !html) {
      result.pagesUnfetchable += 1;
      continue;
    }
    result.pagesProcessed += 1;

    const extraction = extractVenueCandidatesFromPage({ pageUrl, html });
    let extractedCount = 0;

    for (const cand of extraction.candidates.slice(0, MAX_VENUES_PER_PAGE)) {
      if (budget.remaining <= 0) break;
      result.venueCandidatesExtracted += 1;
      const resolution = await resolveVenueCandidateWithPlaces(
        prisma,
        {
          name: cand.name,
          city: cand.city ?? lead.city,
          region: cand.region ?? lead.region,
          streetAddress: cand.streetAddress,
          websiteUrl: cand.websiteUrl,
        },
        budget,
      );
      if (!placeResolutionIsUsable(resolution)) continue;

      const ingested = await ingestGrowthLeadCandidate(prisma, {
        leadType: "VENUE",
        // Identity from our own extraction; Google only confirms the venue is real.
        name: cand.name,
        websiteUrl: cand.websiteUrl ?? null,
        city: cand.city ?? lead.city,
        region: cand.region ?? lead.region,
        discoveryMarketSlug: lead.discoveryMarketSlug,
        source: "directory_lead_reprocess",
        sourceKind: "WEBSITE_CONTACT",
        openMicSignalTier: lead.openMicSignalTier ?? "STRONG_LIVE_EVENT",
        googlePlaceId: resolution.placeId,
        importKey: `reprocess:place:${resolution.placeId}`,
        internalNotes: `Extracted from directory/article lead ${lead.id} (${pageUrl}) via ${cand.method}; Google place match ${Math.round((resolution.matchScore ?? 0) * 100)}%.`,
        discoveryHints: {
          source: "directory_lead_reprocess",
          extractedFrom: { sourceUrl: pageUrl, method: cand.method, originLeadId: lead.id },
          placeResolution: { placeId: resolution.placeId, matchScore: resolution.matchScore },
        },
      });
      if (ingested.status === "created") result.venueLeadsCreated += 1;
      else if (ingested.status === "duplicate") result.venueLeadsDuplicate += 1;
      else result.venueLeadsSkipped += 1;
      extractedCount += 1;
    }

    const isNonTargetPage =
      extraction.pageRole === "directory_or_article" ||
      isDirectoryHost(lead.websiteHostNormalized) ||
      isDirectoryListingPath(pageUrl);

    if (!isNonTargetPage && extractedCount === 0) {
      // A venue's own site whose name we could not read: keep it for a later pass.
      result.keptForIdentityRetry += 1;
      continue;
    }

    await prisma.growthLead.update({
      where: { id: lead.id },
      data: {
        status: "REJECTED",
        internalNotes: `${lead.internalNotes ?? ""}\n[${new Date().toISOString().slice(0, 10)}] Non-target: directory/article page, not a venue identity (${extraction.pageRoleReason}). Extracted ${extractedCount} real venue(s).`.trim(),
      },
    });
    result.directoryLeadsRetired += 1;
  }

  result.placeLookupsSpent = budget.spentCount;
  result.placeCacheHits = budget.cacheHitCount;
  return result;
}
