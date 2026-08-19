/**
 * Inventory + one-time migration for autonomous growth ops states.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { classifyOutreachTargetIdentity } from "@/lib/growth/outreachTargetIdentity";
import {
  classifyGrowthOpsState,
  reclassifyFormerManualReview,
  type GrowthOpsState,
} from "@/lib/growth/growthOpsState";
import {
  parseOutreachEvidenceState,
  permanentSkipReasonForLead,
  type OutreachEvidenceState,
} from "@/lib/growth/outreachEvidenceCrawl";

export const GROWTH_OPS_MIGRATION_KEY = "GROWTH_OPS_MANUAL_REVIEW_MIGRATED_AT";

export type GrowthOpsInventory = {
  autoSendReady: number;
  autoResearchRetry: number;
  hardReject: number;
  unclassified: number;
  retryScheduled: number;
};

function hintsRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

function classifyLeadRow(input: {
  name: string;
  leadType: "VENUE" | "PROMOTER_ACCOUNT" | "ARTIST";
  websiteUrl: string | null;
  websiteHostNormalized: string | null;
  contactEmailNormalized: string | null;
  contactEmailConfidence: string | null;
  city: string | null;
  region: string | null;
  discoveryHints: unknown;
  listing?: {
    googlePlaceId: string | null;
    formattedAddress: string | null;
    name: string | null;
    city: string | null;
    region: string | null;
  } | null;
}): GrowthOpsState {
  const listing = input.listing;
  const hardReject = permanentSkipReasonForLead({
    name: input.name,
    leadType: input.leadType,
    websiteUrl: input.websiteUrl,
    websiteHostNormalized: input.websiteHostNormalized,
    contactEmailNormalized: input.contactEmailNormalized,
    city: input.city ?? listing?.city,
    region: input.region ?? listing?.region,
    formattedAddress: listing?.formattedAddress,
    googlePlaceId: listing?.googlePlaceId,
    listingName: listing?.name,
  });
  const ident = classifyOutreachTargetIdentity({
    name: input.name,
    leadType: input.leadType,
    websiteUrl: input.websiteUrl,
    websiteHostNormalized: input.websiteHostNormalized,
    contactEmailNormalized: input.contactEmailNormalized,
    city: input.city,
    googlePlaceId: listing?.googlePlaceId,
    formattedAddress: listing?.formattedAddress,
    listingName: listing?.name,
  });
  const stored = parseOutreachEvidenceState(input.discoveryHints);
  const contactHigh = input.contactEmailConfidence === "HIGH";
  const evidenceAutoSend = stored?.opsState === "AUTO_SEND_READY" || stored?.tier === "A" || stored?.tier === "B";
  return classifyGrowthOpsState({
    hardReject,
    identityDecision: ident.decision,
    evidenceAutoSend,
    contactHigh,
  }).state;
}

export async function countGrowthOpsInventory(prisma: PrismaClient): Promise<GrowthOpsInventory> {
  const out: GrowthOpsInventory = {
    autoSendReady: 0,
    autoResearchRetry: 0,
    hardReject: 0,
    unclassified: 0,
    retryScheduled: 0,
  };
  const batch = 500;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.growthLead.findMany({
      where: { leadType: { in: ["VENUE", "PROMOTER_ACCOUNT"] }, status: { notIn: ["REJECTED", "UNSUBSCRIBED", "BOUNCED"] } },
      select: {
        id: true,
        name: true,
        leadType: true,
        websiteUrl: true,
        websiteHostNormalized: true,
        contactEmailNormalized: true,
        contactEmailConfidence: true,
        city: true,
        region: true,
        discoveryHints: true,
        publicListings: {
          where: { removedAt: null },
          select: { googlePlaceId: true, formattedAddress: true, name: true, city: true, region: true },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      const stored = parseOutreachEvidenceState(row.discoveryHints);
      const state = stored?.opsState ?? classifyLeadRow({ ...row, listing: row.publicListings[0] ?? null });
      if (state === "AUTO_SEND_READY") out.autoSendReady += 1;
      else if (state === "AUTO_RESEARCH_RETRY") {
        out.autoResearchRetry += 1;
        if (stored?.nextCheckAt) {
          const next = new Date(stored.nextCheckAt);
          if (!Number.isNaN(next.getTime()) && next.getTime() > Date.now()) {
            out.retryScheduled += 1;
          }
        }
      } else if (state === "HARD_REJECT") out.hardReject += 1;
      else out.unclassified += 1;
    }
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < batch) break;
  }
  return out;
}

/** Migrate former manual-review ambiguous leads into AUTO_RESEARCH_RETRY (bounded). */
export async function migrateFormerManualReviewLeads(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<{ migrated: number; hardRejected: number }> {
  const limit = Math.min(400, Math.max(0, opts?.limit ?? 120));
  let migrated = 0;
  let hardRejected = 0;
  const rows = await prisma.growthLead.findMany({
    where: {
      leadType: { in: ["VENUE", "PROMOTER_ACCOUNT"] },
      status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
      websiteUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      leadType: true,
      websiteUrl: true,
      websiteHostNormalized: true,
      contactEmailNormalized: true,
      contactEmailConfidence: true,
      city: true,
      region: true,
      discoveryHints: true,
      publicListings: {
        where: { removedAt: null },
        select: { googlePlaceId: true, formattedAddress: true, name: true, city: true, region: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.max(limit * 3, 200),
  });

  const now = new Date().toISOString();
  for (const row of rows) {
    if (migrated + hardRejected >= limit) break;
    const listing = row.publicListings[0] ?? null;
    const hardReject = permanentSkipReasonForLead({
      name: row.name,
      leadType: row.leadType,
      websiteUrl: row.websiteUrl,
      websiteHostNormalized: row.websiteHostNormalized,
      contactEmailNormalized: row.contactEmailNormalized,
      city: row.city ?? listing?.city,
      region: row.region ?? listing?.region,
      formattedAddress: listing?.formattedAddress,
      googlePlaceId: listing?.googlePlaceId,
      listingName: listing?.name,
    });
    const ident = classifyOutreachTargetIdentity({
      name: row.name,
      leadType: row.leadType,
      websiteUrl: row.websiteUrl,
      websiteHostNormalized: row.websiteHostNormalized,
      contactEmailNormalized: row.contactEmailNormalized,
      city: row.city,
      googlePlaceId: listing?.googlePlaceId,
      formattedAddress: listing?.formattedAddress,
      listingName: listing?.name,
    });
    const stored = parseOutreachEvidenceState(row.discoveryHints);
    if (stored?.opsState === "AUTO_SEND_READY" || stored?.opsState === "HARD_REJECT") continue;
    const contactHigh = row.contactEmailConfidence === "HIGH";
    const ops = reclassifyFormerManualReview({
      hardReject,
      identityDecision: ident.decision,
      evidenceAutoSend: stored?.tier === "A" || stored?.tier === "B",
      contactHigh,
    });
    const shouldMigrate =
      ident.decision === "manual_review" ||
      stored?.opsState === "AUTO_RESEARCH_RETRY" ||
      !stored?.opsState;
    if (!shouldMigrate && ops.state !== "HARD_REJECT") continue;

    if (ops.state === "HARD_REJECT") {
      hardRejected += 1;
    } else if (ops.state === "AUTO_SEND_READY") {
      migrated += 1;
    } else if (shouldMigrate) {
      migrated += 1;
    } else {
      continue;
    }

    const cur = hintsRecord(row.discoveryHints);
    const prevEvidence = (cur.outreachEvidence as OutreachEvidenceState | undefined) ?? null;
    const nextEvidence: OutreachEvidenceState = {
      url: prevEvidence?.url ?? null,
      snippet: prevEvidence?.snippet ?? null,
      title: prevEvidence?.title ?? null,
      eventName: prevEvidence?.eventName ?? null,
      recurringLanguage: prevEvidence?.recurringLanguage ?? null,
      weekdayTime: prevEvidence?.weekdayTime ?? null,
      sourceType: prevEvidence?.sourceType ?? "none",
      evidenceDate: prevEvidence?.evidenceDate ?? null,
      firstSeenAt: prevEvidence?.firstSeenAt ?? null,
      lastCheckedAt: now,
      nextCheckAt: prevEvidence?.nextCheckAt ?? now,
      skipPermanent: ops.state === "HARD_REJECT",
      skipReason: hardReject ?? prevEvidence?.skipReason ?? ops.reason,
      tier: prevEvidence?.tier ?? null,
      confidence: prevEvidence?.confidence ?? null,
      opsState: ops.state,
    };
    cur.outreachEvidence = nextEvidence;
    await prisma.growthLead.update({
      where: { id: row.id },
      data: { discoveryHints: cur as Prisma.InputJsonValue },
    });
  }

  await prisma.operationalRuntimeSetting.upsert({
    where: { key: GROWTH_OPS_MIGRATION_KEY },
    create: {
      key: GROWTH_OPS_MIGRATION_KEY,
      valueType: "string",
      value: now,
      updatedBy: "growth-ops-migration",
      reason: `migrated=${migrated} hard=${hardRejected}`,
    },
    update: {
      value: now,
      updatedBy: "growth-ops-migration",
      reason: `migrated=${migrated} hard=${hardRejected}`,
    },
  });

  return { migrated, hardRejected };
}

export async function ensureGrowthOpsMigration(prisma: PrismaClient): Promise<{ migrated: number; hardRejected: number } | null> {
  const done = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: GROWTH_OPS_MIGRATION_KEY },
    select: { value: true },
  });
  if (done?.value) return null;
  return migrateFormerManualReviewLeads(prisma, { limit: 150 });
}
