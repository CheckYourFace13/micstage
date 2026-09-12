import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { classifyListingName } from "@/lib/publicListings/listingQuality";
import { listingHasGeoConflict } from "@/lib/publicListings/evidenceTrust";

export type AutoRejectJunkResult = {
  scanned: number;
  rejected: number;
  byReason: Record<string, number>;
};

function autoRejectJunkPerRun(): number {
  return Math.min(200, Math.max(0, parseIntEnv("LISTING_AUTO_REJECT_JUNK_PER_RUN", 80)));
}

function appendNote(existing: string | null | undefined, reason: string): string {
  const line = `[${new Date().toISOString().slice(0, 10)}] auto-reject: ${reason}`;
  const base = existing?.trim();
  return base ? `${base}\n${line}` : line;
}

/**
 * Deterministically demote obvious garbage to OUTDATED.
 * Covers review-queue junk and unclaimed VERIFIED rows whose names fail
 * the public display gate (legacy false positives).
 * Does not touch claimed listings.
 * Does NOT mass-demote VERIFIED rows solely for a historical weak Google
 * place-name score (event titles often mismatch Place display names).
 */
export async function autoRejectJunkListings(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<AutoRejectJunkResult> {
  const limit = opts?.limit ?? autoRejectJunkPerRun();
  if (limit <= 0) return { scanned: 0, rejected: 0, byReason: {} };

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED", "VERIFIED"] },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      region: true,
      city: true,
      formattedAddress: true,
      websiteUrl: true,
      sourceUrl: true,
      internalNotes: true,
      evidenceTerminalReason: true,
      evidenceEnrichAttemptCount: true,
      verificationStatus: true,
      growthLead: { select: { discoveryMarketSlug: true } },
    },
  });

  let rejected = 0;
  const byReason: Record<string, number> = {};

  const exhaustedTerminal = new Set([
    "NO_TRUSTED_EVIDENCE",
    "NO_EXPLICIT_PHRASE",
    "OFFICIAL_HISTORICAL_ONLY",
    "OFFICIAL_CANCELLED_EVENT",
    "RAW_SNIPPET_ONLY",
  ]);

  for (const row of rows) {
    const nameReject = classifyListingName(row.name);
    const geoConflict = listingHasGeoConflict({
      region: row.region,
      city: row.city,
      formattedAddress: row.formattedAddress,
      name: row.name,
      discoveryMarketSlug: row.growthLead?.discoveryMarketSlug,
    });
    const mediaWeakPlace =
      row.verificationStatus === "VERIFIED" && isMediaOrDirectoryWeakPlace(row);

    let reason: string | null = null;
    if (nameReject) reason = `JUNK_NAME_${nameReject}`;
    else if (mediaWeakPlace) reason = "WEAK_PLACE_MEDIA_OR_DIRECTORY";
    else if (row.verificationStatus !== "VERIFIED" && geoConflict) reason = "PLACE_OR_REGION_CONFLICT";
    else if (
      row.verificationStatus !== "VERIFIED" &&
      row.evidenceTerminalReason &&
      exhaustedTerminal.has(row.evidenceTerminalReason) &&
      (row.evidenceEnrichAttemptCount ?? 0) >= 2
    ) {
      reason = `EXHAUSTED_${row.evidenceTerminalReason}`;
    }

    if (!reason) continue;

    byReason[reason] = (byReason[reason] ?? 0) + 1;
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "OUTDATED",
        evidenceTerminalReason: reason.slice(0, 80),
        internalNotes: appendNote(row.internalNotes, reason),
      },
    });
    rejected += 1;
  }

  return { scanned: rows.length, rejected, byReason };
}

/** Weak Google match only counts as FP when identity is also a media/directory shell. */
function isMediaOrDirectoryWeakPlace(row: {
  name: string;
  internalNotes: string | null;
  websiteUrl: string | null;
  sourceUrl: string | null;
}): boolean {
  const notes = row.internalNotes ?? "";
  const m = /Weak name match\s*\((\d+)%\)/i.exec(notes);
  if (!m || Number(m[1]) >= 45) return false;
  const url = `${row.websiteUrl ?? ""} ${row.sourceUrl ?? ""}`.toLowerCase();
  const name = row.name ?? "";
  const hasOpenMicIdentity =
    /\bopen[\s-]?mics?\b|\bopen[\s-]?mikes?\b|\bopen\s+jams?\b|\bopen\s+stage\b/i.test(name) ||
    /(\bat\s+[a-z0-9])|@|(\bpresented\s+by\b)|(\bhosted\s+by\b)/i.test(name);
  if (
    /list-tags\/|city-data\.com|experiencecolumbiasc\.com|\/best-of-|ohiomagazine\.com|gorockford\.com\/things-to-do|eventbrite\.com\/d\//.test(
      url,
    )
  ) {
    return true;
  }
  if (/wordpress\.com/.test(url) && !hasOpenMicIdentity) return true;
  if (/blocked_aggregator_or_media_domain/i.test(notes) && !hasOpenMicIdentity) return true;
  return false;
}
