/**
 * Host-lane lead ingestion.
 *
 * `ingestGrowthLeadCandidate` requires a parsed mailbox for every lead except inventory-path
 * venues, so an emailless host could never enter the pipeline. Hosts are found before their
 * mailbox is: the identity comes off an event page, the address comes later from
 * `enrichGrowthLeadOfficialEvidence`, which already crawls `PROMOTER_ACCOUNT` rows that have a
 * `websiteUrl`. This module is the emailless entry point for that flow; anything with a mailbox
 * is delegated to the shared ingest so dedupe/contact behavior stays identical.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import { findExistingGrowthLeadForDedupe } from "@/lib/growth/growthLeadDedupe";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";
import { ingestGrowthLeadCandidate, type IngestGrowthLeadResult } from "@/lib/growth/growthLeadIngest";
import { classifyHostName, isMineableHostUrl, isUsableHostName } from "@/lib/growth/hostNameQuality";
import {
  normalizeNameCityKey,
  normalizeNameSuburbKey,
  normalizeWebsiteHost,
} from "@/lib/growth/leadFieldNormalization";

export type HostLaneIngestOptions = {
  /**
   * Domains that must not become the host's website — normally the venue the host was found at.
   * Mining a venue mailbox onto a host lead would send a host pitch to the venue's inbox.
   */
  excludeWebsiteHosts?: (string | null | undefined)[];
};

/** True for candidates that belong to the host lane and must skip the venue-shaped ingest path. */
export function isHostLaneCandidate(candidate: GrowthLeadCandidate): boolean {
  if (candidate.leadType !== "PROMOTER_ACCOUNT") return false;
  const hints = candidate.discoveryHints;
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return false;
  return (hints as Record<string, unknown>).hostOutreachLane === true;
}

function excludedHosts(opts: HostLaneIngestOptions | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of opts?.excludeWebsiteHosts ?? []) {
    const host = normalizeWebsiteHost(raw ?? null);
    if (host) out.add(host);
  }
  return out;
}

function hostsRelated(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * The URL enrichment will crawl for this host's mailbox. It must be first-party-ish: directories
 * and social platforms cannot yield a domain-matching address, and the venue's own domain would
 * yield the venue's.
 */
export function resolveHostCrawlUrl(
  candidate: Pick<GrowthLeadCandidate, "websiteUrl" | "contactUrl">,
  opts?: HostLaneIngestOptions,
): { url: string; host: string } | null {
  const blocked = excludedHosts(opts);
  for (const raw of [candidate.websiteUrl, candidate.contactUrl]) {
    if (!isMineableHostUrl(raw)) continue;
    const host = normalizeWebsiteHost(raw ?? null);
    if (!host) continue;
    if ([...blocked].some((b) => hostsRelated(host, b))) continue;
    return { url: raw!.trim(), host };
  }
  return null;
}

/**
 * Create (or fold into) a `PROMOTER_ACCOUNT` lead that has no mailbox yet.
 *
 * Requires a validated host identity and a crawlable host-owned URL. The lead enters as
 * DISCOVERED with no contact, so no send path can pick it up until enrichment proves a HIGH
 * confidence address on it.
 */
export async function ingestHostLaneLeadCandidate(
  prisma: PrismaClient,
  candidate: GrowthLeadCandidate,
  opts?: HostLaneIngestOptions,
): Promise<IngestGrowthLeadResult> {
  const name = candidate.name?.trim();
  if (!name) return { status: "skipped", reason: "missing name" };
  if (!isUsableHostName(name)) {
    return { status: "skipped", reason: `host_name_not_identity:${classifyHostName(name)}` };
  }

  if (candidate.contactEmailNormalized?.trim()) {
    const withEmail = await ingestGrowthLeadCandidate(prisma, candidate);
    // A rejected/unparseable address must not sink the host identity — fall through to emailless.
    if (withEmail.status !== "skipped" || !withEmail.reason.startsWith("no_valid_email")) {
      return withEmail;
    }
  }

  const crawl = resolveHostCrawlUrl(candidate, opts);
  if (!crawl) return { status: "skipped", reason: "host_lead_no_mineable_host_url" };

  const discoveryMarketSlug = candidate.discoveryMarketSlug?.trim() || null;
  const importKey = candidate.importKey?.trim() || null;

  const dup = await findExistingGrowthLeadForDedupe(prisma, {
    leadType: "PROMOTER_ACCOUNT",
    discoveryMarketSlug,
    importKey,
    websiteHostNormalized: crawl.host,
    nameCityKey: normalizeNameCityKey(name, candidate.city ?? null),
    nameSuburbKey: normalizeNameSuburbKey(name, candidate.suburb ?? null),
  });
  if (dup) {
    await mergeVenueDiscoveryHints(prisma, dup.id, candidate.discoveryHints ?? undefined);
    return { status: "duplicate", existingId: dup.id, reason: dup.reason };
  }

  try {
    const row = await prisma.growthLead.create({
      data: {
        name: name.slice(0, 180),
        leadType: "PROMOTER_ACCOUNT",
        status: "DISCOVERED",
        websiteUrl: crawl.url,
        websiteHostNormalized: crawl.host,
        contactUrl: candidate.contactUrl?.trim() || null,
        instagramUrl: candidate.instagramUrl?.trim() || null,
        facebookUrl: candidate.facebookUrl?.trim() || null,
        city: candidate.city?.trim() || null,
        suburb: candidate.suburb?.trim() || null,
        region: candidate.region?.trim() || null,
        discoveryMarketSlug,
        source: candidate.source?.trim() || null,
        sourceKind: candidate.sourceKind,
        fitScore: candidate.fitScore ?? null,
        discoveryConfidence: candidate.discoveryConfidence ?? null,
        openMicSignalTier: candidate.openMicSignalTier ?? undefined,
        contactQuality: candidate.contactQuality ?? undefined,
        performanceTags: candidate.performanceTags?.length ? candidate.performanceTags : [],
        importKey,
        internalNotes: candidate.internalNotes?.trim() || null,
        discoveryHints: candidate.discoveryHints ?? undefined,
      },
      select: { id: true },
    });
    return { status: "created", id: row.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && importKey) {
      const existing = await prisma.growthLead.findUnique({
        where: { importKey },
        select: { id: true },
      });
      if (existing) {
        await mergeVenueDiscoveryHints(prisma, existing.id, candidate.discoveryHints ?? undefined);
        return { status: "duplicate", existingId: existing.id, reason: "importKey_race" };
      }
    }
    throw e;
  }
}
