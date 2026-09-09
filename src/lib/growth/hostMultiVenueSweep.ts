/**
 * Sweep existing VENUE leads for host brands that appear at more than one venue.
 *
 * `tagHostMultiVenueProspect` only ever runs at host-ingest time, so every brand recorded as a
 * hint before that call existed — or recorded once per venue over many ticks — stayed invisible.
 * This sweep re-reads `discoveryHints.hostBrand` across the venue inventory, groups by normalized
 * brand, and marks brands seen at 2+ distinct venues. Multi-venue hosts are the highest-value
 * outreach target: one account can activate several venues and their whole performer list.
 *
 * Bounded on purpose: a fixed row cap per run, a fixed brand cap per run, and a persisted cursor
 * so consecutive runs cover the whole table without ever blowing the tick's runtime budget.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { ingestHostLaneLeadCandidate } from "@/lib/growth/hostLeadIngest";
import { HOST_MULTI_VENUE_PROSPECT } from "@/lib/growth/hostMultiVenueProspect";
import { isMineableHostUrl, isUsableHostName, normalizeHostBrandKey } from "@/lib/growth/hostNameQuality";
import { HOST_OUTREACH_CTA_PATH } from "@/lib/growth/hostOutreachSignals";

export const HOST_MULTI_VENUE_SWEEP_CURSOR_KEY = "GROWTH_HOST_MULTI_VENUE_SWEEP_CURSOR";

/** Venue rows read per page, and the ceiling for one run. */
const SWEEP_PAGE_SIZE = 500;
const SWEEP_MAX_ROWS_DEFAULT = 2_000;
/** Brands promoted per run: each one writes to a handful of leads. */
const SWEEP_MAX_BRANDS_DEFAULT = 20;
const MIN_VENUES_FOR_MULTI_VENUE = 2;

export type HostMultiVenueSweepResult = {
  scanned: number;
  brandsSeen: number;
  multiVenueBrands: number;
  venuesTagged: number;
  promoterLeadsUpdated: number;
  promoterLeadsCreated: number;
  auditEventsCreated: number;
  cursorWrapped: boolean;
  skippedForBudget: boolean;
};

type VenueRow = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  discoveryMarketSlug: string | null;
  websiteHostNormalized: string | null;
  discoveryHints: unknown;
};

type BrandGroup = {
  display: string;
  venueIds: Set<string>;
  cities: Set<string>;
  hostUrl: string | null;
  marketSlug: string | null;
  venueHosts: Set<string>;
};

function hintsRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

function stringHint(hints: Record<string, unknown>, key: string): string | null {
  const v = hints[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function readSweepCursor(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: HOST_MULTI_VENUE_SWEEP_CURSOR_KEY },
    select: { value: true },
  });
  const id = row?.value?.trim();
  return id ? id : null;
}

async function writeSweepCursor(prisma: PrismaClient, leadId: string | null): Promise<void> {
  const value = leadId ?? "";
  await prisma.operationalRuntimeSetting.upsert({
    where: { key: HOST_MULTI_VENUE_SWEEP_CURSOR_KEY },
    create: {
      key: HOST_MULTI_VENUE_SWEEP_CURSOR_KEY,
      valueType: "string",
      value,
      updatedBy: "host-multi-venue-sweep",
      reason: "rotating_scan_position",
    },
    update: {
      valueType: "string",
      value,
      updatedBy: "host-multi-venue-sweep",
      reason: "rotating_scan_position",
    },
  });
}

/**
 * Overwrite the multi-venue keys on a lead's hints.
 *
 * `mergeVenueDiscoveryHints` only fills absent keys, which is right for discovery metadata but
 * would freeze `hostMultiVenueCount` at its first value as more venues are found.
 */
async function patchMultiVenueHints(
  prisma: PrismaClient,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const existing = await prisma.growthLead.findUnique({
    where: { id: leadId },
    select: { discoveryHints: true },
  });
  const next = { ...hintsRecord(existing?.discoveryHints), ...patch };
  await prisma.growthLead.update({
    where: { id: leadId },
    data: { discoveryHints: next as Prisma.InputJsonValue },
  });
}

/** Group venue rows by normalized host brand. Exported for unit tests (no DB needed). */
export function groupVenueRowsByHostBrand(rows: VenueRow[]): Map<string, BrandGroup> {
  const groups = new Map<string, BrandGroup>();
  for (const row of rows) {
    const hints = hintsRecord(row.discoveryHints);
    const brand = stringHint(hints, "hostBrand");
    if (!brand) continue;
    const key = normalizeHostBrandKey(brand);
    if (key.length < 3) continue;
    if (!isUsableHostName(brand)) continue;

    const group = groups.get(key) ?? {
      display: brand,
      venueIds: new Set<string>(),
      cities: new Set<string>(),
      hostUrl: null,
      marketSlug: null,
      venueHosts: new Set<string>(),
    };
    group.venueIds.add(row.id);
    if (row.city) group.cities.add(row.city);
    if (row.websiteHostNormalized) group.venueHosts.add(row.websiteHostNormalized);
    group.marketSlug = group.marketSlug ?? row.discoveryMarketSlug;
    if (!group.hostUrl) {
      const candidateUrl = stringHint(hints, "hostWebsiteUrl") ?? stringHint(hints, "hostEvidenceSourceUrl");
      if (isMineableHostUrl(candidateUrl)) group.hostUrl = candidateUrl;
    }
    groups.set(key, group);
  }
  return groups;
}

/**
 * Scan a bounded slice of the venue inventory and promote every host brand seen at 2+ venues.
 */
export async function sweepHostMultiVenueProspects(
  prisma: PrismaClient,
  opts?: { maxRows?: number; maxBrands?: number; budgetMs?: number },
): Promise<HostMultiVenueSweepResult> {
  const started = Date.now();
  const budgetMs = Math.max(500, opts?.budgetMs ?? 6_000);
  const maxRows = Math.max(SWEEP_PAGE_SIZE, Math.min(5_000, opts?.maxRows ?? SWEEP_MAX_ROWS_DEFAULT));
  const maxBrands = Math.max(1, Math.min(50, opts?.maxBrands ?? SWEEP_MAX_BRANDS_DEFAULT));

  const out: HostMultiVenueSweepResult = {
    scanned: 0,
    brandsSeen: 0,
    multiVenueBrands: 0,
    venuesTagged: 0,
    promoterLeadsUpdated: 0,
    promoterLeadsCreated: 0,
    auditEventsCreated: 0,
    cursorWrapped: false,
    skippedForBudget: false,
  };

  /**
   * Filtering JSON contents server-side (`string_contains` on the whole document) is unreliable,
   * so the query only excludes leads with no hints at all and `groupVenueRowsByHostBrand` does the
   * `hostBrand` selection in memory. The row cap plus the cursor keep the read bounded.
   */
  const where: Prisma.GrowthLeadWhereInput = {
    leadType: "VENUE",
    discoveryHints: { not: Prisma.DbNull },
  };

  const rows: VenueRow[] = [];
  let cursorId = await readSweepCursor(prisma);
  let wrapped = false;

  while (rows.length < maxRows) {
    if (Date.now() - started > budgetMs) {
      out.skippedForBudget = true;
      break;
    }
    const page = (await prisma.growthLead.findMany({
      where,
      select: {
        id: true,
        name: true,
        city: true,
        region: true,
        discoveryMarketSlug: true,
        websiteHostNormalized: true,
        discoveryHints: true,
      },
      orderBy: { id: "asc" },
      take: Math.min(SWEEP_PAGE_SIZE, maxRows - rows.length),
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })) as VenueRow[];

    if (page.length === 0) {
      if (wrapped || !cursorId) break;
      cursorId = null;
      wrapped = true;
      out.cursorWrapped = true;
      continue;
    }
    rows.push(...page);
    cursorId = page[page.length - 1]!.id;
  }
  out.scanned = rows.length;
  await writeSweepCursor(prisma, cursorId);

  const groups = groupVenueRowsByHostBrand(rows);
  out.brandsSeen = groups.size;

  const multiVenue = [...groups.entries()]
    .filter(([, g]) => g.venueIds.size >= MIN_VENUES_FOR_MULTI_VENUE)
    .sort((a, b) => b[1].venueIds.size - a[1].venueIds.size)
    .slice(0, maxBrands);

  for (const [, group] of multiVenue) {
    if (Date.now() - started > budgetMs) {
      out.skippedForBudget = true;
      break;
    }
    out.multiVenueBrands += 1;
    const venueLeadIds = [...group.venueIds];
    const city = [...group.cities][0] ?? null;
    const hintPatch = {
      hostBrand: group.display,
      hostMultiVenueProspect: true,
      hostMultiVenueCount: venueLeadIds.length,
      hostMultiVenueVenueLeadIds: venueLeadIds.slice(0, 24),
      hostMultiVenueTaggedAt: new Date().toISOString(),
    };

    let promoterLead = await prisma.growthLead.findFirst({
      where: { leadType: "PROMOTER_ACCOUNT", name: { equals: group.display, mode: "insensitive" } },
      select: { id: true },
    });

    /**
     * No host lead yet: create one only when a venue hint carried a crawlable host-owned URL.
     * Without one, enrichment could never find the host's mailbox, so a row would be dead weight.
     */
    if (!promoterLead && group.hostUrl) {
      const created = await ingestHostLaneLeadCandidate(
        prisma,
        {
          leadType: "PROMOTER_ACCOUNT",
          name: group.display,
          websiteUrl: group.hostUrl,
          city: city ?? undefined,
          discoveryMarketSlug: group.marketSlug ?? undefined,
          source: "host_multi_venue_sweep",
          sourceKind: "EVENT_LISTING",
          openMicSignalTier: "EXPLICIT_OPEN_MIC",
          fitScore: 7,
          discoveryConfidence: 70,
          internalNotes: `Host brand seen at ${venueLeadIds.length} venues by the multi-venue sweep.`,
          discoveryHints: {
            hostOutreachLane: true,
            hostCtaPath: HOST_OUTREACH_CTA_PATH,
            ...hintPatch,
          },
        },
        { excludeWebsiteHosts: [...group.venueHosts] },
      );
      if (created.status === "created") {
        out.promoterLeadsCreated += 1;
        promoterLead = { id: created.id };
      } else if (created.status === "duplicate") {
        promoterLead = { id: created.existingId };
      }
    }

    if (promoterLead) {
      await patchMultiVenueHints(prisma, promoterLead.id, {
        hostOutreachLane: true,
        hostCtaPath: HOST_OUTREACH_CTA_PATH,
        ...hintPatch,
      });
      out.promoterLeadsUpdated += 1;
    }

    for (const venueLeadId of venueLeadIds) {
      await patchMultiVenueHints(prisma, venueLeadId, hintPatch);
      out.venuesTagged += 1;
    }

    const existingAudit = await prisma.marketingEvent.findFirst({
      where: {
        type: "INTERNAL_AUDIT",
        payload: { path: ["event"], equals: HOST_MULTI_VENUE_PROSPECT },
        AND: { payload: { path: ["hostBrand"], equals: group.display } },
      },
      select: { id: true },
    });
    if (!existingAudit) {
      await prisma.marketingEvent.create({
        data: {
          type: "INTERNAL_AUDIT",
          payload: {
            event: HOST_MULTI_VENUE_PROSPECT,
            hostBrand: group.display,
            venueLeadIds: venueLeadIds.slice(0, 24),
            venueCount: venueLeadIds.length,
            city,
            detectedBy: "host_multi_venue_sweep",
          },
        },
      });
      out.auditEventsCreated += 1;
    }
  }

  return out;
}
