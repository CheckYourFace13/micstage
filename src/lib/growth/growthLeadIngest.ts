import { Prisma } from "@/generated/prisma/client";
import type { GrowthLeadEmailConfidence } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import {
  enqueueGrowthVenuePathTasks,
  persistGrowthLeadEmailContacts,
} from "@/lib/growth/growthLeadContactAutomation";
import { findExistingGrowthLeadForDedupe } from "@/lib/growth/growthLeadDedupe";
import { mergeVenueDiscoveryHints } from "@/lib/growth/growthLeadDiscoveryHintsMerge";
import { mergeGrowthLeadFromClaudeImport } from "@/lib/growth/growthLeadMergeFromImport";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import {
  normalizeFacebookUrlForDedupe,
  normalizeInstagramHandle,
  normalizeNameCityKey,
  normalizeNameSuburbKey,
  normalizeWebsiteHost,
} from "@/lib/growth/leadFieldNormalization";

export type IngestGrowthLeadOptions = {
  mergeOnDuplicate?: { importMetaNote: string };
};

export type IngestGrowthLeadResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; existingId: string; reason: string; merged?: boolean }
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

/**
 * Persist the first parsed-valid mailbox on the lead row so admin/export queues see a primary email when imports only
 * supplied `additionalContactEmails` (or the primary field failed parse but an extra was valid).
 */
function resolveStoredPrimaryEmail(
  raw: GrowthLeadCandidate,
  primary: ReturnType<typeof parsePrimaryEmailForIngest>,
): ReturnType<typeof parsePrimaryEmailForIngest> {
  if (primary.normalized) return primary;
  for (const extra of raw.additionalContactEmails ?? []) {
    const p = parseGrowthLeadEmailInput(extra, { extractedFromNoisyText: true });
    if (p.kind === "valid") {
      return {
        normalized: p.normalized,
        rawExtracted: p.rawExtracted,
        confidence: p.confidence,
        rejectionReason: null,
      };
    }
  }
  return primary;
}

function additionalEmailsNormalizedForDedupe(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const e of raw ?? []) {
    const p = parseGrowthLeadEmailInput(e, { extractedFromNoisyText: true });
    if (p.kind === "valid") out.push(p.normalized);
  }
  return out;
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

async function handleDuplicateLead(
  prisma: PrismaClient,
  dupId: string,
  raw: GrowthLeadCandidate,
  opts: IngestGrowthLeadOptions | undefined,
  name: string,
  primary: ReturnType<typeof parsePrimaryEmailForIngest>,
  discoveryMarketSlug: string | null,
  reason: string,
): Promise<IngestGrowthLeadResult> {
  let merged = false;
  if (opts?.mergeOnDuplicate?.importMetaNote) {
    merged = await mergeGrowthLeadFromClaudeImport(
      prisma,
      dupId,
      raw,
      opts.mergeOnDuplicate.importMetaNote,
    );
  }
  if (raw.leadType === "VENUE") {
    const sidecarPrimary =
      primary.normalized && (primary.confidence === "HIGH" || primary.confidence === "MEDIUM")
        ? primary.normalized
        : null;

    await persistGrowthLeadEmailContacts(prisma, {
      leadId: dupId,
      leadName: name,
      discoveryMarketSlug,
      source: raw.source ?? null,
      websiteUrl: raw.websiteUrl ?? null,
      confidence: raw.discoveryConfidence ?? null,
      primaryEmail: sidecarPrimary,
      additionalEmails: raw.additionalContactEmails ?? [],
    });
    await enqueueGrowthVenuePathTasks(prisma, {
      leadId: dupId,
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
    await mergeVenueDiscoveryHints(prisma, dupId, raw.discoveryHints ?? undefined);
  } else {
    const sidecarPrimary =
      primary.normalized && (primary.confidence === "HIGH" || primary.confidence === "MEDIUM")
        ? primary.normalized
        : null;
    if (sidecarPrimary || (raw.additionalContactEmails?.length ?? 0) > 0) {
      await persistGrowthLeadEmailContacts(prisma, {
        leadId: dupId,
        leadName: name,
        discoveryMarketSlug,
        source: raw.source ?? null,
        websiteUrl: raw.websiteUrl ?? null,
        confidence: raw.discoveryConfidence ?? null,
        primaryEmail: sidecarPrimary,
        additionalEmails: raw.additionalContactEmails ?? [],
      });
    }
  }
  return { status: "duplicate", existingId: dupId, reason, merged };
}

export async function ingestGrowthLeadCandidate(
  prisma: PrismaClient,
  raw: GrowthLeadCandidate,
  opts?: IngestGrowthLeadOptions,
): Promise<IngestGrowthLeadResult> {
  const name = raw.name?.trim();
  if (!name) return { status: "skipped", reason: "missing name" };

  const discoveryMarketSlug = raw.discoveryMarketSlug?.trim() || null;

  const primaryParsed = parsePrimaryEmailForIngest(raw);
  const primary = resolveStoredPrimaryEmail(raw, primaryParsed);
  const email = primary.normalized;
  /** Main growth-lead table is email-only: never insert new rows without at least one parsed-valid mailbox. */
  if (!hasAnyValidParsedEmail(primaryParsed, raw.additionalContactEmails)) {
    return { status: "skipped", reason: "no_valid_email_for_main_pipeline" };
  }
  const websiteHostNormalized = normalizeWebsiteHost(raw.websiteUrl ?? null);
  const instagramHandleNormalized = normalizeInstagramHandle(raw.instagramUrl ?? null);
  const nameCityKey = normalizeNameCityKey(name, raw.city ?? null);
  const nameSuburbKey = normalizeNameSuburbKey(name, raw.suburb ?? null);
  const facebookUrlNormalized = normalizeFacebookUrlForDedupe(raw.facebookUrl ?? null);
  const additionalEmailsNormalized = additionalEmailsNormalizedForDedupe(raw.additionalContactEmails);

  const dup = await findExistingGrowthLeadForDedupe(prisma, {
    leadType: raw.leadType,
    discoveryMarketSlug,
    contactEmailNormalized: email,
    additionalEmailsNormalized,
    importKey: raw.importKey ?? null,
    websiteHostNormalized,
    instagramHandleNormalized,
    facebookUrlNormalized,
    nameCityKey,
    nameSuburbKey,
  });
  if (dup) {
    return handleDuplicateLead(prisma, dup.id, raw, opts, name, primary, discoveryMarketSlug, dup.reason);
  }

  const trimmedImportKey = raw.importKey?.trim() || null;
  let row;
  try {
    row = await prisma.growthLead.create({
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
        importKey: trimmedImportKey,
        internalNotes: raw.internalNotes?.trim() || null,
        websiteHostNormalized,
        instagramHandleNormalized,
        discoveryHints: raw.discoveryHints ?? undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && trimmedImportKey) {
      const existing = await prisma.growthLead.findUnique({
        where: { importKey: trimmedImportKey },
        select: { id: true },
      });
      if (existing) {
        return handleDuplicateLead(
          prisma,
          existing.id,
          raw,
          opts,
          name,
          primary,
          discoveryMarketSlug,
          "importKey_race",
        );
      }
    }
    throw e;
  }

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
  } else {
    const sidecarPrimary =
      primary.normalized && (primary.confidence === "HIGH" || primary.confidence === "MEDIUM")
        ? primary.normalized
        : null;
    if (sidecarPrimary || (raw.additionalContactEmails?.length ?? 0) > 0) {
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
    }
  }

  return { status: "created", id: row.id };
}
