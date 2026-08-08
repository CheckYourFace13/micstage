import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { autoPublishGrowthLeadsAsListings } from "@/lib/publicListings/autoPublishGrowthLeadsAsListings";
import { autoRejectJunkListings } from "@/lib/publicListings/autoRejectJunkListings";
import { enrichListingsMissingTrustedEvidence } from "@/lib/publicListings/evidenceEnrichment";
import { verifyPublicListingsWithGoogle } from "@/lib/publicListings/googlePlacesVerify";
import { promotePlaceConfirmedListings } from "@/lib/publicListings/promotePlaceConfirmedListings";
import { mineVerifiedListingOfficialEmails } from "@/lib/publicListings/mineVerifiedListingContacts";
import { micstagePromotionKillSwitch } from "@/lib/publicListings/automationKillSwitches";

const BACKLOG_ADAPTER = "listing_backlog_processor";
const BACKLOG_MARKET = "_global";
const REPROCESS_CURSOR_KEY = "lead_reprocess_updated_at";

export type ListingBacklogProcessorResult = {
  published: number;
  publishSkipped: number;
  publishBacklogRemaining: number;
  googleVerify: Awaited<ReturnType<typeof verifyPublicListingsWithGoogle>>;
  promoted: number;
  junkRejected: number;
  junkByReason: Record<string, number>;
  evidenceEnrich: Awaited<ReturnType<typeof enrichListingsMissingTrustedEvidence>>;
  contactMine: Awaited<ReturnType<typeof mineVerifiedListingOfficialEmails>>;
  leadsReprocessed: number;
  killed?: boolean;
};

function backlogPublishLimit(): number {
  return Math.min(80, Math.max(0, parseIntEnv("LISTING_BACKLOG_PUBLISH_PER_TICK", 50)));
}

function backlogVerifyLimit(): number {
  return Math.min(50, Math.max(0, parseIntEnv("LISTING_BACKLOG_GOOGLE_VERIFY_PER_TICK", 30)));
}

function backlogPromoteLimit(): number {
  return Math.min(100, Math.max(0, parseIntEnv("LISTING_BACKLOG_PROMOTE_PER_TICK", 60)));
}

function backlogEnrichLimit(): number {
  return Math.min(50, Math.max(0, parseIntEnv("LISTING_BACKLOG_EVIDENCE_ENRICH_PER_TICK", 30)));
}

function backlogJunkLimit(): number {
  return Math.min(200, Math.max(0, parseIntEnv("LISTING_AUTO_REJECT_JUNK_PER_RUN", 80)));
}

function backlogContactMineLimit(): number {
  return Math.min(40, Math.max(0, parseIntEnv("LISTING_VERIFIED_CONTACT_MINE_PER_TICK", 20)));
}

function backlogLeadReprocessLimit(): number {
  return Math.min(100, Math.max(0, parseIntEnv("LISTING_LEAD_REPROCESS_PER_TICK", 40)));
}

/**
 * High-throughput backlog processor independent of discovery.
 * Runs on tick so publish/verify/promote continue even when the discovery
 * half-hour guard returns already_completed / already_running.
 */
export async function runListingBacklogProcessor(
  prisma: PrismaClient,
): Promise<ListingBacklogProcessorResult> {
  if (micstagePromotionKillSwitch()) {
    return {
      published: 0,
      publishSkipped: 0,
      publishBacklogRemaining: 0,
      googleVerify: { verified: 0, needsReview: 0, outdated: 0, skipped: 0, noApiKey: false },
      promoted: 0,
      junkRejected: 0,
      junkByReason: {},
      evidenceEnrich: { processed: 0, evidenceStored: 0, promoted: 0, rejected: 0, skipped: 0 },
      contactMine: { scanned: 0, mined: 0, highOfficial: 0, failed: 0 },
      leadsReprocessed: 0,
      killed: true,
    };
  }

  // A: reject obvious garbage first so later promote/enrich skip them.
  const junk = await autoRejectJunkListings(prisma, { limit: backlogJunkLimit() });

  // B: publish waiting leads only (verify/promote run below with tick budgets).
  const publish = await autoPublishGrowthLeadsAsListings(prisma, {
    publishLimit: backlogPublishLimit(),
    enrichLimit: Math.min(25, Math.floor(backlogPublishLimit() / 4)),
    skipDownstream: true,
  });

  const googleVerify = await verifyPublicListingsWithGoogle(prisma, {
    limit: backlogVerifyLimit(),
  });
  const promote = await promotePlaceConfirmedListings(prisma, {
    limit: backlogPromoteLimit(),
  });
  const evidenceEnrich = await enrichListingsMissingTrustedEvidence(prisma, {
    limit: backlogEnrichLimit(),
  });

  const contactMine = await mineVerifiedListingOfficialEmails(prisma, {
    limit: backlogContactMineLimit(),
  });

  const leadsReprocessed = await reprocessOldLeadsCursor(prisma, backlogLeadReprocessLimit());

  return {
    published: publish.published,
    publishSkipped: publish.skipped,
    publishBacklogRemaining: publish.backlogRemaining,
    googleVerify,
    promoted: promote.promoted + evidenceEnrich.promoted,
    junkRejected: junk.rejected,
    junkByReason: junk.byReason,
    evidenceEnrich,
    contactMine,
    leadsReprocessed,
  };
}

/**
 * Incrementally touch old unpublished venue leads so updatedAt rotation
 * keeps them flowing through publish selection and contact automation.
 */
async function reprocessOldLeadsCursor(prisma: PrismaClient, limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const cursorRaw = await readDiscoveryCursor(prisma, BACKLOG_ADAPTER, BACKLOG_MARKET, REPROCESS_CURSOR_KEY);
  const after = cursorRaw ? new Date(cursorRaw) : new Date(0);
  if (Number.isNaN(after.getTime())) {
    // fall through with epoch
  }

  const leads = await prisma.growthLead.findMany({
    where: {
      leadType: "VENUE",
      openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
      NOT: { publicListings: { some: {} } },
      updatedAt: { gt: after },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true, updatedAt: true, websiteUrl: true, contactUrl: true },
  });

  if (leads.length === 0) {
    // Wrap cursor so we keep sweeping the backlog.
    await writeDiscoveryCursor(prisma, BACKLOG_ADAPTER, BACKLOG_MARKET, REPROCESS_CURSOR_KEY, new Date(0).toISOString());
    return 0;
  }

  // Touch via a no-op status write so @updatedAt advances and oldest-first publish rotates.
  for (const lead of leads) {
    await prisma.growthLead.update({
      where: { id: lead.id },
      data: { status: "DISCOVERED" },
    });
  }

  const last = leads[leads.length - 1]!;
  await writeDiscoveryCursor(
    prisma,
    BACKLOG_ADAPTER,
    BACKLOG_MARKET,
    REPROCESS_CURSOR_KEY,
    last.updatedAt.toISOString(),
  );
  return leads.length;
}
