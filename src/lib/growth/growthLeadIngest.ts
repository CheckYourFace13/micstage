import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import { findExistingGrowthLeadForDedupe } from "@/lib/growth/growthLeadDedupe";
import {
  normalizeInstagramHandle,
  normalizeNameCityKey,
  normalizeWebsiteHost,
} from "@/lib/growth/leadFieldNormalization";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

export type IngestGrowthLeadResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; existingId: string; reason: string }
  | { status: "skipped"; reason: string };

export async function ingestGrowthLeadCandidate(
  prisma: PrismaClient,
  raw: GrowthLeadCandidate,
): Promise<IngestGrowthLeadResult> {
  const name = raw.name?.trim();
  if (!name) return { status: "skipped", reason: "missing name" };

  const discoveryMarketSlug = raw.discoveryMarketSlug?.trim();
  if (!discoveryMarketSlug) return { status: "skipped", reason: "missing discoveryMarketSlug" };

  const email = raw.contactEmailNormalized ? normalizeMarketingEmail(raw.contactEmailNormalized) : null;
  const websiteHostNormalized = normalizeWebsiteHost(raw.websiteUrl ?? null);
  const instagramHandleNormalized = normalizeInstagramHandle(raw.instagramUrl ?? null);
  const nameCityKey = normalizeNameCityKey(name, raw.city ?? null);

  const dup = await findExistingGrowthLeadForDedupe(prisma, {
    leadType: raw.leadType,
    discoveryMarketSlug,
    contactEmailNormalized: email,
    importKey: raw.importKey ?? null,
    websiteHostNormalized,
    instagramHandleNormalized,
    nameCityKey,
  });
  if (dup) {
    return { status: "duplicate", existingId: dup.id, reason: dup.reason };
  }

  const row = await prisma.growthLead.create({
    data: {
      name,
      leadType: raw.leadType,
      status: "DISCOVERED",
      contactEmailNormalized: email || null,
      contactUrl: raw.contactUrl?.trim() || null,
      websiteUrl: raw.websiteUrl?.trim() || null,
      instagramUrl: raw.instagramUrl?.trim() || null,
      youtubeUrl: raw.youtubeUrl?.trim() || null,
      tiktokUrl: raw.tiktokUrl?.trim() || null,
      city: raw.city?.trim() || null,
      suburb: raw.suburb?.trim() || null,
      region: raw.region?.trim() || null,
      discoveryMarketSlug,
      performanceTags: raw.performanceTags?.length ? raw.performanceTags : [],
      source: raw.source?.trim() || null,
      sourceKind: raw.sourceKind,
      fitScore: raw.fitScore ?? null,
      discoveryConfidence: raw.discoveryConfidence ?? null,
      importKey: raw.importKey?.trim() || null,
      internalNotes: raw.internalNotes?.trim() || null,
      websiteHostNormalized,
      instagramHandleNormalized,
    },
  });

  return { status: "created", id: row.id };
}
