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
 * Deterministically demote obvious garbage in the review queue to OUTDATED.
 * Does not touch VERIFIED rows or claimed listings.
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
      verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED"] },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      region: true,
      city: true,
      formattedAddress: true,
      internalNotes: true,
      evidenceTerminalReason: true,
      evidenceEnrichAttemptCount: true,
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

    let reason: string | null = null;
    if (nameReject) reason = `JUNK_NAME_${nameReject}`;
    else if (geoConflict) reason = "PLACE_OR_REGION_CONFLICT";
    else if (
      row.evidenceTerminalReason &&
      exhaustedTerminal.has(row.evidenceTerminalReason) &&
      (row.evidenceEnrichAttemptCount ?? 0) >= 2
    ) {
      // Enrichment already concluded — do not park forever in NEEDS_REVIEW.
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
