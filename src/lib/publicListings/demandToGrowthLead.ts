import type { OpenMicDemandRequestKind, PrismaClient } from "@/generated/prisma/client";
import { discoveryRollupSlugFromCityRegion } from "@/lib/discoveryMarket";

function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e.slice(0, 320);
}

/**
 * When a public demand form includes an email, mirror it into GrowthLead for ops follow-up.
 */
export async function attachDemandToGrowthLead(
  prisma: PrismaClient,
  demand: {
    id: string;
    kind: OpenMicDemandRequestKind;
    email: string | null;
    name: string | null;
    city: string | null;
    region: string | null;
    venueName: string | null;
    message: string | null;
  },
): Promise<string | null> {
  const email = normalizeEmail(demand.email);
  if (!email) return null;

  const importKey = `demand-${demand.id}`;
  const existing = await prisma.growthLead.findUnique({
    where: { importKey },
    select: { id: true },
  });
  if (existing) {
    await prisma.openMicDemandRequest.update({
      where: { id: demand.id },
      data: { growthLeadId: existing.id },
    });
    return existing.id;
  }

  const city = demand.city?.trim() || null;
  const region = demand.region?.trim() || null;
  const name =
    demand.venueName?.trim() ||
    demand.name?.trim() ||
    (city ? `Open mic demand — ${city}` : "MicStage public demand");

  const discoveryMarketSlug = city ? discoveryRollupSlugFromCityRegion(city, region) : null;

  const lead = await prisma.growthLead.create({
    data: {
      name: name.slice(0, 200),
      leadType: "VENUE",
      status: "DISCOVERED",
      contactEmailNormalized: email,
      contactEmailRaw: demand.email,
      contactEmailConfidence: "MEDIUM",
      city,
      region,
      discoveryMarketSlug,
      source: `public_demand:${demand.kind}`,
      sourceKind: "MANUAL_ADMIN",
      importKey,
      internalNotes: [demand.message, demand.name ? `Contact: ${demand.name}` : null]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000) || null,
    },
  });

  await prisma.openMicDemandRequest.update({
    where: { id: demand.id },
    data: { growthLeadId: lead.id },
  });

  return lead.id;
}
