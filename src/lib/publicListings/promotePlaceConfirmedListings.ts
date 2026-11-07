import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import {
  evaluateOpenMicEvidence,
  extractDiscoverySnippet,
  OPEN_MIC_EVIDENCE_REASON,
  type OpenMicEvidenceInput,
} from "@/lib/publicListings/openMicEvidence";
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";
import { classifyListingName, isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";
import { submitUrlsToIndexNow } from "@/lib/seo/searchEnginePing";

const PROMOTE_CURSOR_ADAPTER = "listing_promote_place_confirmed";
const PROMOTE_CURSOR_MARKET = "_global";
const PROMOTE_ROTATE_KEY = "rotateId";

export type PromotePlaceConfirmedResult = {
  scanned: number;
  promoted: number;
  skippedNoTrustedEvidence: number;
  skippedNonVenueName: number;
  junkOutdated: number;
  claimInvitesAttempted: number;
};

function listingPromotePerDiscoveryRun(): number {
  return Math.min(100, Math.max(0, parseIntEnv("LISTING_PROMOTE_PLACE_CONFIRMED_PER_RUN", 40)));
}

function appendNote(existing: string | null | undefined, reason: string): string {
  const line = `[${new Date().toISOString().slice(0, 10)}] promote: ${reason}`;
  const base = existing?.trim();
  return base ? `${base}\n${line}` : line;
}

function buildEvidenceInput(row: {
  name: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  schedules: Array<{ title: string | null; description: string | null }>;
  growthLead: { sourceKind: string | null; internalNotes: string | null; discoveryHints: unknown } | null;
}): OpenMicEvidenceInput {
  return {
    listingName: row.name,
    schedules: row.schedules,
    sourceSnippet: extractDiscoverySnippet(row.growthLead?.internalNotes),
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: row.growthLead?.sourceKind ?? null,
  };
}

/**
 * Promote place-confirmed NEEDS_REVIEW listings to VERIFIED when trusted open-mic evidence exists.
 * Same safety rules as `scripts/promote-reviewed-open-mic-listings.mjs` — runs on discovery cron.
 */
export async function promotePlaceConfirmedListings(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<PromotePlaceConfirmedResult> {
  const limit = opts?.limit ?? listingPromotePerDiscoveryRun();
  if (limit <= 0) {
    return {
      scanned: 0,
      promoted: 0,
      skippedNoTrustedEvidence: 0,
      skippedNonVenueName: 0,
      junkOutdated: 0,
      claimInvitesAttempted: 0,
    };
  }

  const where = {
    claimedVenueId: null,
    verificationStatus: "NEEDS_REVIEW" as const,
    googlePlaceId: { not: null },
    googlePlaceVerifiedAt: { not: null },
  };
  const select = {
    id: true,
    slug: true,
    name: true,
    city: true,
    region: true,
    formattedAddress: true,
    internalNotes: true,
    sourceUrl: true,
    websiteUrl: true,
    schedules: { select: { title: true, description: true } },
    growthLead: {
      select: {
        sourceKind: true,
        internalNotes: true,
        discoveryHints: true,
        discoveryMarketSlug: true,
      },
    },
  } as const;

  // Rotate so skipped-no-evidence head rows cannot monopolize every promote tick.
  const fairTake = Math.max(1, Math.ceil(limit / 2));
  const hotTake = Math.max(0, limit - fairTake);
  let cursorId = await readDiscoveryCursor(
    prisma,
    PROMOTE_CURSOR_ADAPTER,
    PROMOTE_CURSOR_MARKET,
    PROMOTE_ROTATE_KEY,
  );
  if (!cursorId?.trim()) cursorId = null;
  const rotating: Array<{ id: string }> = [];
  for (let page = 0; page < 2 && rotating.length < fairTake; page++) {
    const pageRows = await prisma.publicOpenMicListing.findMany({
      where,
      orderBy: [{ id: "asc" }],
      take: fairTake - rotating.length,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true },
    });
    if (pageRows.length === 0) {
      if (!cursorId) break;
      cursorId = null;
      continue;
    }
    rotating.push(...pageRows);
    cursorId = pageRows[pageRows.length - 1]!.id;
  }
  await writeDiscoveryCursor(
    prisma,
    PROMOTE_CURSOR_ADAPTER,
    PROMOTE_CURSOR_MARKET,
    PROMOTE_ROTATE_KEY,
    cursorId ?? "",
  );

  const rotatingIds = rotating.map((r) => r.id);
  const hot =
    hotTake > 0
      ? await prisma.publicOpenMicListing.findMany({
          where: {
            ...where,
            ...(rotatingIds.length > 0 ? { id: { notIn: rotatingIds } } : {}),
          },
          orderBy: [{ updatedAt: "desc" }],
          take: hotTake,
          select,
        })
      : [];
  const rotatedFull =
    rotatingIds.length > 0
      ? await prisma.publicOpenMicListing.findMany({
          where: { ...where, id: { in: rotatingIds } },
          select,
        })
      : [];
  const byId = new Map(rotatedFull.map((r) => [r.id, r]));
  const rows = [...hot, ...rotatingIds.map((id) => byId.get(id)!).filter(Boolean)];

  let promoted = 0;
  let skippedNoTrustedEvidence = 0;
  let skippedNonVenueName = 0;
  let junkOutdated = 0;
  let claimInvitesAttempted = 0;
  const indexUrls: string[] = [];
  const base = appBaseUrl().replace(/\/$/, "");

  for (const row of rows) {
    const nameReject = classifyListingName(row.name);
    if (nameReject) {
      skippedNonVenueName += 1;
      junkOutdated += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          evidenceTerminalReason: `JUNK_NAME_${nameReject}`.slice(0, 80),
          internalNotes: appendNote(row.internalNotes, `auto-reject JUNK_NAME_${nameReject}`),
        },
      });
      continue;
    }

    if (
      listingHasGeoConflict({
        region: row.region,
        city: row.city,
        formattedAddress: row.formattedAddress,
        name: row.name,
        discoveryMarketSlug: row.growthLead?.discoveryMarketSlug,
      })
    ) {
      junkOutdated += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          evidenceTerminalReason: "PLACE_OR_REGION_CONFLICT",
          internalNotes: appendNote(row.internalNotes, "auto-reject PLACE_OR_REGION_CONFLICT"),
        },
      });
      continue;
    }

    const weakPlace = /Weak name match\s*\((\d+)%\)/i.exec(row.internalNotes ?? "");
    const url = `${row.websiteUrl ?? ""} ${row.sourceUrl ?? ""}`.toLowerCase();
    const hasOpenMicIdentity =
      /\bopen[\s-]?mics?\b|\bopen[\s-]?mikes?\b|\bopen\s+jams?\b|\bopen\s+stage\b/i.test(row.name) ||
      /(\bat\s+[a-z0-9])|@|(\bpresented\s+by\b)|(\bhosted\s+by\b)/i.test(row.name);
    const mediaWeak =
      weakPlace &&
      Number(weakPlace[1]) < 45 &&
      (/list-tags\/|city-data\.com|experiencecolumbiasc\.com|\/best-of-|ohiomagazine\.com|gorockford\.com\/things-to-do|eventbrite\.com\/d\//.test(
        url,
      ) ||
        (/wordpress\.com/.test(url) && !hasOpenMicIdentity) ||
        (/blocked_aggregator_or_media_domain/i.test(row.internalNotes ?? "") && !hasOpenMicIdentity));
    if (mediaWeak) {
      skippedNonVenueName += 1;
      junkOutdated += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          evidenceTerminalReason: "WEAK_PLACE_MEDIA_OR_DIRECTORY",
          googlePlaceId: null,
          googlePlaceVerifiedAt: null,
          internalNotes: appendNote(row.internalNotes, "auto-reject WEAK_PLACE_MEDIA_OR_DIRECTORY"),
        },
      });
      continue;
    }

    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    if (!evidence.trusted) {
      skippedNoTrustedEvidence += 1;
      continue;
    }
    if (!isPublicListingNameOk(row.name)) {
      skippedNonVenueName += 1;
      continue;
    }

    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
        internalNotes: appendNote(
          row.internalNotes,
          `auto-promote ${OPEN_MIC_EVIDENCE_REASON.CONFIRMED} (${evidence.field}: "${evidence.snippet}"); place identity confirmed`,
        ),
      },
    });
    promoted += 1;
    indexUrls.push(`${base}/open-mics/${encodeURIComponent(row.slug)}`);

    claimInvitesAttempted += 1;
    await sendListingClaimInviteIfNeeded(prisma, row.id).catch((e) => {
      console.error("[promotePlaceConfirmed] claim invite failed", {
        listingId: row.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }

  if (indexUrls.length > 0) {
    await submitUrlsToIndexNow(indexUrls).catch((e) => {
      console.warn("[promotePlaceConfirmed] IndexNow ping failed", e instanceof Error ? e.message : e);
    });
  }

  return {
    scanned: rows.length,
    promoted,
    skippedNoTrustedEvidence,
    skippedNonVenueName,
    junkOutdated,
    claimInvitesAttempted,
  };
}
