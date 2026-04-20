import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";
import {
  normalizeFacebookUrlForDedupe,
  normalizeInstagramHandle,
  normalizeWebsiteHost,
} from "@/lib/growth/leadFieldNormalization";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";

function mergeNotes(existing: string | null, incoming: string | null, meta: string): string {
  const metaTrim = meta.trim();
  let metaUse = metaTrim;
  const batchId = metaTrim.match(/batch=([a-f0-9-]{36})/i)?.[1];
  if (batchId && existing?.includes(batchId)) {
    metaUse = "";
  }
  const parts = [existing?.trim(), incoming?.trim(), metaUse].filter(Boolean);
  return parts.join("\n\n").slice(0, 19_500);
}

/**
 * Fill blank fields and upgrade numeric hints when re-importing the same lead.
 * Returns whether any column changed.
 */
export async function mergeGrowthLeadFromClaudeImport(
  prisma: PrismaClient,
  leadId: string,
  raw: GrowthLeadCandidate,
  importMetaNote: string,
): Promise<boolean> {
  const existing = await prisma.growthLead.findUnique({ where: { id: leadId } });
  if (!existing) return false;

  const data: Prisma.GrowthLeadUpdateInput = {};
  const take = (next: string | null | undefined, prev: string | null | undefined) =>
    next?.trim() && !prev?.trim() ? next.trim() : undefined;

  if (!existing.contactEmailNormalized) {
    const tryMailbox = (rawStr: string, extractedFromNoisyText: boolean): boolean => {
      const parsed = parseGrowthLeadEmailInput(rawStr, { extractedFromNoisyText });
      if (parsed.kind === "valid") {
        data.contactEmailNormalized = parsed.normalized;
        data.contactEmailRaw = parsed.rawExtracted;
        data.contactEmailConfidence = parsed.confidence;
        data.contactEmailRejectionReason = null;
        return true;
      }
      return false;
    };
    const rawMailbox = raw.contactEmailNormalized?.trim();
    if (!(rawMailbox && tryMailbox(rawMailbox, raw.emailExtractedFromNoisyText === true))) {
      for (const ex of raw.additionalContactEmails ?? []) {
        if (tryMailbox(ex, true)) break;
      }
    }
  }

  const uContactUrl = take(raw.contactUrl, existing.contactUrl);
  if (uContactUrl) data.contactUrl = uContactUrl;

  const uWebsite = take(raw.websiteUrl, existing.websiteUrl);
  if (uWebsite) {
    data.websiteUrl = uWebsite;
    const h = normalizeWebsiteHost(uWebsite);
    if (h) data.websiteHostNormalized = h;
  }

  const uIg = take(raw.instagramUrl, existing.instagramUrl);
  if (uIg) {
    data.instagramUrl = uIg;
    const ig = normalizeInstagramHandle(uIg);
    if (ig) data.instagramHandleNormalized = ig;
  }

  const uFb = take(raw.facebookUrl, existing.facebookUrl);
  if (uFb) {
    data.facebookUrl = normalizeFacebookUrlForDedupe(uFb) ?? uFb.trim();
  }

  const uCity = take(raw.city, existing.city);
  if (uCity) data.city = uCity;
  const uSuburb = take(raw.suburb, existing.suburb);
  if (uSuburb) data.suburb = uSuburb;
  const uRegion = take(raw.region, existing.region);
  if (uRegion) data.region = uRegion;

  const uSource = take(raw.source, existing.source);
  if (uSource) data.source = uSource;

  if (raw.openMicSignalTier && !existing.openMicSignalTier) {
    data.openMicSignalTier = raw.openMicSignalTier;
  }
  if (raw.contactQuality && !existing.contactQuality) {
    data.contactQuality = raw.contactQuality;
  }

  if (raw.fitScore != null && (existing.fitScore == null || raw.fitScore > existing.fitScore)) {
    data.fitScore = raw.fitScore;
  }
  if (raw.discoveryConfidence != null) {
    if (existing.discoveryConfidence == null || raw.discoveryConfidence > existing.discoveryConfidence) {
      data.discoveryConfidence = raw.discoveryConfidence;
    }
  }

  if (raw.performanceTags?.length) {
    const merged = [...new Set([...existing.performanceTags, ...raw.performanceTags])];
    if (merged.length > existing.performanceTags.length) {
      data.performanceTags = { set: merged };
    }
  }

  if (raw.sourceKind !== existing.sourceKind) {
    data.sourceKind = raw.sourceKind;
  }

  const newNotes = mergeNotes(existing.internalNotes, raw.internalNotes ?? null, importMetaNote);
  if (newNotes !== (existing.internalNotes ?? "")) {
    data.internalNotes = newNotes;
  }

  if (Object.keys(data).length === 0) {
    if (raw.discoveryHints != null) {
      await mergeVenueDiscoveryHints(prisma, leadId, raw.discoveryHints);
      return true;
    }
    return false;
  }

  await prisma.growthLead.update({ where: { id: leadId }, data });
  if (raw.discoveryHints != null) {
    await mergeVenueDiscoveryHints(prisma, leadId, raw.discoveryHints);
  }
  return true;
}
