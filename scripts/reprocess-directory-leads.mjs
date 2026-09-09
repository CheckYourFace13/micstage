/**
 * Reprocess directory/article leads that entered before discovery resolved real identities.
 *
 * For each bad lead: crawl its page, extract the real venues it mentions, resolve them against
 * Google Places, create/reuse those venue leads, then mark the directory lead as non-target.
 * Nothing is deleted, and leads with outreach history or claimed listings are left alone.
 *
 * Usage: node --import ./scripts/alias-hook.mjs scripts/reprocess-directory-leads.mjs [--apply] [--limit N]
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const { isUsableVenueName, extractVenueCandidatesFromPage } = await import(
  "../src/lib/growth/discovery/venueCandidateExtraction.ts"
);
const { PlaceLookupBudget, placeResolutionIsUsable, resolveVenueCandidateWithPlaces } = await import(
  "../src/lib/growth/discovery/venuePlaceResolution.ts"
);
const { ingestGrowthLeadCandidate } = await import("../src/lib/growth/growthLeadIngest.ts");
const { isDirectoryHost, isDirectoryListingPath } = await import("../src/lib/growth/outreachTargetIdentity.ts");

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1], 10) : 40;
const LOOKUPS = Number.parseInt(process.env.DISCOVERY_PLACE_LOOKUPS_PER_RUN ?? "120", 10);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function fetchHtml(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "MicStageBot/1.0 (+https://micstage.com/about)", Accept: "text/html" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const stats = {
  scanned: 0,
  badIdentityLeads: 0,
  skippedHasOutreach: 0,
  skippedClaimedListing: 0,
  pagesFetched: 0,
  pagesUnfetchable: 0,
  venueCandidatesExtracted: 0,
  placeLookups: 0,
  placeCacheHits: 0,
  placeResolved: 0,
  placeUnresolved: 0,
  venueLeadsCreated: 0,
  venueLeadsDuplicate: 0,
  venueLeadsSkipped: 0,
  directoryLeadsRejected: 0,
};
const examples = [];

const candidates = await prisma.growthLead.findMany({
  where: {
    leadType: "VENUE",
    status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
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
});

const budget = new PlaceLookupBudget(LOOKUPS);

for (const lead of candidates) {
  stats.scanned++;
  const badName = !isUsableVenueName(lead.name);
  const badHost = isDirectoryHost(lead.websiteHostNormalized) || isDirectoryListingPath(lead.websiteUrl);
  if (!badName && !badHost) continue;
  stats.badIdentityLeads++;

  if (lead._count.outreachDrafts > 0) {
    stats.skippedHasOutreach++;
    continue;
  }
  if (lead.publicListings.some((l) => l.claimStatus !== "UNCLAIMED")) {
    stats.skippedClaimedListing++;
    continue;
  }
  if (stats.pagesFetched >= LIMIT) continue;

  const html = lead.websiteUrl ? await fetchHtml(lead.websiteUrl) : null;
  if (!html) {
    stats.pagesUnfetchable++;
    continue;
  }
  stats.pagesFetched++;

  const extraction = extractVenueCandidatesFromPage({ pageUrl: lead.websiteUrl, html });
  const found = [];
  for (const cand of extraction.candidates.slice(0, 8)) {
    stats.venueCandidatesExtracted++;
    const before = budget.spentCount;
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
    if (budget.spentCount > before) stats.placeLookups++;
    if (!placeResolutionIsUsable(resolution)) {
      stats.placeUnresolved++;
      continue;
    }
    stats.placeResolved++;

    if (!APPLY) {
      found.push(`${resolution.canonicalName} (${resolution.formattedAddress})`);
      continue;
    }

    const res = await ingestGrowthLeadCandidate(prisma, {
      leadType: "VENUE",
      name: resolution.canonicalName ?? cand.name,
      websiteUrl: cand.websiteUrl ?? resolution.website ?? null,
      city: cand.city ?? lead.city,
      region: cand.region ?? lead.region,
      discoveryMarketSlug: lead.discoveryMarketSlug,
      source: "directory_lead_reprocess",
      sourceKind: "WEBSITE_CONTACT",
      openMicSignalTier: lead.openMicSignalTier ?? "STRONG_LIVE_EVENT",
      googlePlaceId: resolution.placeId,
      placeCanonicalName: resolution.canonicalName,
      placeFormattedAddress: resolution.formattedAddress,
      placeLat: resolution.lat,
      placeLng: resolution.lng,
      importKey: `reprocess:place:${resolution.placeId}`,
      internalNotes: `Extracted from directory/article lead ${lead.id} (${lead.websiteUrl}) via ${cand.method}; Google place match ${Math.round((resolution.matchScore ?? 0) * 100)}%.`,
      discoveryHints: {
        source: "directory_lead_reprocess",
        extractedFrom: { sourceUrl: lead.websiteUrl, method: cand.method, originLeadId: lead.id },
        placeResolution: { placeId: resolution.placeId, matchScore: resolution.matchScore },
      },
    });
    if (res.status === "created") stats.venueLeadsCreated++;
    else if (res.status === "duplicate") stats.venueLeadsDuplicate++;
    else stats.venueLeadsSkipped++;
    found.push(`${resolution.canonicalName} [${res.status}]`);
  }

  if (APPLY) {
    await prisma.growthLead.update({
      where: { id: lead.id },
      data: {
        status: "REJECTED",
        internalNotes: `${lead.internalNotes ?? ""}\n[${new Date().toISOString().slice(0, 10)}] Non-target: directory/article page, not a venue identity (${extraction.pageRoleReason}). Extracted ${found.length} real venue(s).`.trim(),
      },
    });
    stats.directoryLeadsRejected++;
  }

  if (examples.length < 12) {
    examples.push({ lead: lead.name?.slice(0, 45), url: lead.websiteUrl?.slice(0, 60), role: extraction.pageRoleReason, extracted: found });
  }
}

console.log(JSON.stringify({ mode: APPLY ? "APPLY" : "DRY_RUN", limit: LIMIT, stats, placeBudget: { spent: budget.spentCount, cacheHits: budget.cacheHitCount }, examples }, null, 2));
await prisma.$disconnect();
