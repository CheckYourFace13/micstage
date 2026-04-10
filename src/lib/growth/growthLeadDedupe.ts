import type { GrowthLeadType } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export type GrowthLeadDedupeInput = {
  leadType: GrowthLeadType;
  discoveryMarketSlug: string | null | undefined;
  contactEmailNormalized?: string | null;
  /** Other mailbox strings (already lowercased valid primaries from same row). */
  additionalEmailsNormalized?: string[] | null;
  importKey?: string | null;
  websiteHostNormalized?: string | null;
  instagramHandleNormalized?: string | null;
  /** From normalizeFacebookUrlForDedupe */
  facebookUrlNormalized?: string | null;
  /** From normalizeNameCityKey */
  nameCityKey?: string | null;
  /** From normalizeNameSuburbKey */
  nameSuburbKey?: string | null;
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
  const market = marketMatch(input.discoveryMarketSlug ?? null);

  const email = input.contactEmailNormalized?.trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.growthLead.findFirst({
      where: { contactEmailNormalized: email },
      select: { id: true },
    });
    if (byEmail) return { id: byEmail.id, reason: "contactEmailNormalized" };
  }

  const extras = (input.additionalEmailsNormalized ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (extras.length) {
    const byAdd = await prisma.growthLead.findFirst({
      where: { contactEmailNormalized: { in: [...new Set(extras)] } },
      select: { id: true },
    });
    if (byAdd) return { id: byAdd.id, reason: "additionalEmailMatchesLead" };
  }

  if (input.importKey?.trim()) {
    const byKey = await prisma.growthLead.findUnique({
      where: { importKey: input.importKey.trim() },
      select: { id: true },
    });
    if (byKey) return { id: byKey.id, reason: "importKey" };
  }

  const host = input.websiteHostNormalized?.trim().toLowerCase();
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

  const fb = input.facebookUrlNormalized?.trim();
  if (fb) {
    let pathKey: string | null = null;
    try {
      const p = new URL(fb).pathname.replace(/^\/+|\/+$/g, "");
      pathKey = p.length ? p.slice(0, 120) : null;
    } catch {
      pathKey = null;
    }
    const byFb = await prisma.growthLead.findFirst({
      where: {
        leadType: input.leadType,
        ...(pathKey
          ? { facebookUrl: { contains: pathKey, mode: "insensitive" as const } }
          : { facebookUrl: { equals: fb, mode: "insensitive" as const } }),
        ...(market ? { discoveryMarketSlug: market } : {}),
      },
      select: { id: true },
    });
    if (byFb) return { id: byFb.id, reason: "facebookUrl" };
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

  const nsk = input.nameSuburbKey?.trim();
  if (nsk && nsk.includes("|")) {
    const [namePart, suburbPart] = nsk.split("|");
    const name = namePart?.trim();
    const suburb = suburbPart?.trim();
    if (name && suburb) {
      const byNameSuburb = await prisma.growthLead.findFirst({
        where: {
          leadType: input.leadType,
          name: { equals: name, mode: "insensitive" },
          suburb: { equals: suburb, mode: "insensitive" },
          ...(market ? { discoveryMarketSlug: market } : {}),
        },
        select: { id: true },
      });
      if (byNameSuburb) return { id: byNameSuburb.id, reason: "nameAndSuburb" };
    }
  }

  const emailForContactLookup = [...new Set([email, ...extras].filter(Boolean))];
  for (const em of emailForContactLookup) {
    const mc = await prisma.marketingContact.findUnique({
      where: { emailNormalized: em },
      select: { meta: true },
    });
    const leadIds = growthMetaLeadIdsFromMarketingContact(mc?.meta);
    for (const leadId of leadIds) {
      const hit = await prisma.growthLead.findFirst({
        where: {
          id: leadId,
          leadType: input.leadType,
          ...(market ? { discoveryMarketSlug: market } : {}),
        },
        select: { id: true },
      });
      if (hit) return { id: hit.id, reason: "marketingContactEmail" };
    }
  }

  return null;
}

function growthMetaLeadIdsFromMarketingContact(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const g = (meta as { growth?: { leadIds?: unknown } }).growth;
  if (!g?.leadIds || !Array.isArray(g.leadIds)) return [];
  return g.leadIds.filter((x): x is string => typeof x === "string" && x.length > 0);
}
