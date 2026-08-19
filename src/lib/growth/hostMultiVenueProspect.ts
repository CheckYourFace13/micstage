/**
 * Detect when host identity evidence appears across multiple venues (multi-venue Host prospect).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";

export const HOST_MULTI_VENUE_PROSPECT = "HOST_MULTI_VENUE_PROSPECT";

function normalizeBrand(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function tagHostMultiVenueProspect(
  prisma: PrismaClient,
  input: {
    hostBrand: string;
    venueLeadId: string;
    promoterLeadId?: string | null;
    city?: string | null;
  },
): Promise<{ tagged: boolean; venueCount: number }> {
  const brandKey = normalizeBrand(input.hostBrand);
  if (!brandKey || brandKey.length < 3) return { tagged: false, venueCount: 0 };

  const venueMatches = await prisma.growthLead.findMany({
    where: {
      leadType: "VENUE",
      id: { not: input.venueLeadId },
      discoveryHints: { string_contains: brandKey },
    },
    select: { id: true },
    take: 20,
  });

  const distinctVenues = new Set([input.venueLeadId, ...venueMatches.map((v) => v.id)]);
  if (distinctVenues.size < 2) return { tagged: false, venueCount: distinctVenues.size };

  const payload = {
    event: HOST_MULTI_VENUE_PROSPECT,
    hostBrand: input.hostBrand,
    venueLeadIds: [...distinctVenues],
    venueCount: distinctVenues.size,
    city: input.city ?? null,
  };

  const existing = await prisma.marketingEvent.findFirst({
    where: {
      type: "INTERNAL_AUDIT",
      payload: { path: ["event"], equals: HOST_MULTI_VENUE_PROSPECT },
      AND: { payload: { path: ["hostBrand"], equals: input.hostBrand } },
    },
    select: { id: true },
  });
  if (!existing) {
    await prisma.marketingEvent.create({
      data: { type: "INTERNAL_AUDIT", payload },
    });
  }

  const hintPatch = {
    hostMultiVenueProspect: true,
    hostBrand: input.hostBrand,
    hostMultiVenueCount: distinctVenues.size,
  };

  if (input.promoterLeadId) {
    await mergeVenueDiscoveryHints(prisma, input.promoterLeadId, {
      ...hintPatch,
      hostOutreachLane: true,
    });
  }

  for (const venueId of distinctVenues) {
    await mergeVenueDiscoveryHints(prisma, venueId, hintPatch);
  }

  return { tagged: true, venueCount: distinctVenues.size };
}
