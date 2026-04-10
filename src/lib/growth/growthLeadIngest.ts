import type { GrowthLeadEmailConfidence } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import {
  enqueueGrowthVenuePathTasks,
  persistGrowthLeadEmailContacts,
} from "@/lib/growth/growthLeadContactAutomation";
import { findExistingGrowthLeadForDedupe } from "@/lib/growth/growthLeadDedupe";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import {
  normalizeInstagramHandle,
  normalizeNameCityKey,
  normalizeWebsiteHost,
} from "@/lib/growth/leadFieldNormalization";

export type IngestGrowthLeadResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; existingId: string; reason: string }
  | { status: "skipped"; reason: string };

function parsePrimaryEmailForIngest(raw: GrowthLeadCandidate): {
  normalized: string | null;
  rawExtracted: string | null;
  confidence: GrowthLeadEmailConfidence | null;
  rejectionReason: string | null;
} {
  const rawStr = raw.contactEmailNormalized?.trim() ?? "";
  if (!rawStr) {
    return { normalized: null, rawExtracted: null, confidence: null, rejectionReason: null };
  }
  const allowPh =
    raw.sourceKind === "MANUAL_ADMIN" && raw.allowPlaceholderEmail === true;
  const parsed = parseGrowthLeadEmailInput(rawStr, {
    allowPlaceholderEmail: allowPh,
    extractedFromNoisyText: raw.emailExtractedFromNoisyText === true,
  });
  if (parsed.kind === "valid") {
    return {
      normalized: parsed.normalized,
      rawExtracted: parsed.rawExtracted,
      confidence: parsed.confidence,
      rejectionReason: null,
    };
  }
  if (parsed.kind === "rejected") {
    return {
      normalized: null,
      rawExtracted: parsed.rawExtracted,
      confidence: null,
      rejectionReason: parsed.rejectionReason,
    };
  }
  return { normalized: null, rawExtracted: null, confidence: null, rejectionReason: null };
}

function hasAnyValidParsedEmail(
  primary: ReturnType<typeof parsePrimaryEmailForIngest>,
  additional: string[] | null | undefined,
): boolean {
  if (primary.normalized) return true;
  for (const e of additional ?? []) {
    const p = parseGrowthLeadEmailInput(e, { extractedFromNoisyText: true });
    if (p.kind === "valid") return true;
  }
  return false;
}

export async function ingestGrowthLeadCandidate(
  prisma: PrismaClient,
  raw: GrowthLeadCandidate,
): Promise<IngestGrowthLeadResult> {
  const name = raw.name?.trim();
  if (!name) return { status: "skipped", reason: "missing name" };

  const discoveryMarketSlug = raw.discoveryMarketSlug?.trim();
  if (!discoveryMarketSlug) return { status: "skipped", reason: "missing discoveryMarketSlug" };

  const primary = parsePrimaryEmailForIngest(raw);
  const email = primary.normalized;
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
    if (raw.leadType === "VENUE") {
      const sidecarPrimary =
        primary.normalized && (primary.confidence === "HIGH" || primary.confidence === "MEDIUM")
          ? primary.normalized
          : null;

      await persistGrowthLeadEmailContacts(prisma, {
        leadId: dup.id,
        leadName: name,
        discoveryMarketSlug,
        source: raw.source ?? null,
        websiteUrl: raw.websiteUrl ?? null,
        confidence: raw.discoveryConfidence ?? null,
        primaryEmail: sidecarPrimary,
        additionalEmails: raw.additionalContactEmails ?? [],
      });
      await enqueueGrowthVenuePathTasks(prisma, {
        leadId: dup.id,
        discoveryMarketSlug,
        leadName: name,
        source: raw.source ?? null,
        confidence: raw.discoveryConfidence ?? null,
        contactUrl: raw.contactUrl ?? null,
        websiteUrl: raw.websiteUrl ?? null,
        instagramUrl: raw.instagramUrl ?? null,
        facebookUrl: raw.facebookUrl ?? null,
        hasAnyEmail: hasAnyValidParsedEmail(primary, raw.additionalContactEmails),
      });
    }
    return { status: "duplicate", existingId: dup.id, reason: dup.reason };
  }

  const row = await prisma.growthLead.create({
    data: {
      name,
      leadType: raw.leadType,
      status: "DISCOVERED",
      contactEmailNormalized: email || null,
      contactEmailRaw: primary.rawExtracted,
      contactEmailConfidence: primary.confidence,
      contactEmailRejectionReason: primary.rejectionReason,
      contactUrl: raw.contactUrl?.trim() || null,
      websiteUrl: raw.websiteUrl?.trim() || null,
      instagramUrl: raw.instagramUrl?.trim() || null,
      youtubeUrl: raw.youtubeUrl?.trim() || null,
      tiktokUrl: raw.tiktokUrl?.trim() || null,
      facebookUrl: raw.facebookUrl?.trim() || null,
      openMicSignalTier: raw.openMicSignalTier ?? undefined,
      contactQuality: raw.contactQuality ?? undefined,
      acquisitionStage: raw.acquisitionStage ?? undefined,
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

  if (raw.leadType === "VENUE") {
    const sidecarPrimary =
      primary.normalized && (primary.confidence === "HIGH" || primary.confidence === "MEDIUM")
        ? primary.normalized
        : null;

    await persistGrowthLeadEmailContacts(prisma, {
      leadId: row.id,
      leadName: name,
      discoveryMarketSlug,
      source: raw.source ?? null,
      websiteUrl: raw.websiteUrl ?? null,
      confidence: raw.discoveryConfidence ?? null,
      primaryEmail: sidecarPrimary,
      additionalEmails: raw.additionalContactEmails ?? [],
    });
    await enqueueGrowthVenuePathTasks(prisma, {
      leadId: row.id,
      discoveryMarketSlug,
      leadName: name,
      source: raw.source ?? null,
      confidence: raw.discoveryConfidence ?? null,
      contactUrl: raw.contactUrl ?? null,
      websiteUrl: raw.websiteUrl ?? null,
      instagramUrl: raw.instagramUrl ?? null,
      facebookUrl: raw.facebookUrl ?? null,
      hasAnyEmail: hasAnyValidParsedEmail(primary, raw.additionalContactEmails),
    });
  }

  return { status: "created", id: row.id };
}
