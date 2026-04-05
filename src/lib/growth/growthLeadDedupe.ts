import type { GrowthLeadType } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export type GrowthLeadDedupeInput = {
  leadType: GrowthLeadType;
  discoveryMarketSlug: string | null | undefined;
  contactEmailNormalized?: string | null;
  importKey?: string | null;
  websiteHostNormalized?: string | null;
  instagramHandleNormalized?: string | null;
  /** From normalizeNameCityKey */
  nameCityKey?: string | null;
};

function marketMatch(slug: string | null | undefined) {
  const s = slug?.trim();
  if (!s) return undefined;
  return { equals: s, mode: "insensitive" as const };
}

/** Returns an existing lead id if this candidate should be treated as a duplicate. */
export async function findExistingGrowthLeadForDedupe(
  prisma: PrismaClient,
  input: GrowthLeadDedupeInput,
): Promise<{ id: string; reason: string } | null> {
  if (input.importKey?.trim()) {
    const byKey = await prisma.growthLead.findUnique({
      where: { importKey: input.importKey.trim() },
      select: { id: true },
    });
    if (byKey) return { id: byKey.id, reason: "importKey" };
  }

  const email = input.contactEmailNormalized?.trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.growthLead.findFirst({
      where: { contactEmailNormalized: email },
      select: { id: true },
    });
    if (byEmail) return { id: byEmail.id, reason: "contactEmailNormalized" };
  }

  const host = input.websiteHostNormalized?.trim().toLowerCase();
  const market = marketMatch(input.discoveryMarketSlug ?? null);
  if (host) {
    const byWeb = await prisma.growthLead.findFirst({
      where: {
        leadType: input.leadType,
        websiteHostNormalized: host,
        ...(market ? { discoveryMarketSlug: market } : {}),
      },
      select: { id: true },
    });
    if (byWeb) return { id: byWeb.id, reason: "websiteHost" };
  }

  const ig = input.instagramHandleNormalized?.trim().toLowerCase();
  if (ig) {
    const byIg = await prisma.growthLead.findFirst({
      where: {
        leadType: input.leadType,
        instagramHandleNormalized: ig,
        ...(market ? { discoveryMarketSlug: market } : {}),
      },
      select: { id: true },
    });
    if (byIg) return { id: byIg.id, reason: "instagramHandle" };
  }

  const nck = input.nameCityKey?.trim();
  if (nck && nck.includes("|")) {
    const [namePart, cityPart] = nck.split("|");
    const name = namePart?.trim();
    const city = cityPart?.trim();
    if (name && city) {
      const byNameCity = await prisma.growthLead.findFirst({
        where: {
          leadType: input.leadType,
          name: { equals: name, mode: "insensitive" },
          city: { equals: city, mode: "insensitive" },
          ...(market ? { discoveryMarketSlug: market } : {}),
        },
        select: { id: true },
      });
      if (byNameCity) return { id: byNameCity.id, reason: "nameAndCity" };
    }
  }

  return null;
}
