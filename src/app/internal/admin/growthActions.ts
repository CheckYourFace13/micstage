"use server";

import { randomUUID } from "node:crypto";
import { assertAdminSession, getOptionalAdminEmailFromLoginForm } from "@/lib/adminAuth";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { CsvImportDefaults } from "@/lib/growth/csvImport";
import { parseClaudeGrowthLeadCsv, parseGrowthLeadsFromCsv } from "@/lib/growth/csvImport";
import { venueLeadMatchesAutoDraftHeuristic } from "@/lib/growth/growthAutoDraftEligibility";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import { createPendingGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadOutreachDraftCreate";
import { inferDiscoveryGeoForNationwideSearch } from "@/lib/growth/discovery/discoveryGeoInference";
import { GROWTH_LEAD_STATUS_SET } from "@/lib/growth/growthLeadStatusSet";
import { sendGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadDraftSend";
import { discoveryRollupSlugFromCityRegion } from "@/lib/discoveryMarket";
import type {
  GrowthLeadAcquisitionStage,
  GrowthLeadPerformanceTag,
  GrowthLeadStatus,
  GrowthLeadType,
} from "@/generated/prisma/client";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { requirePrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function q(base: string, key: string, val: string) {
  return `${base}?${key}=${encodeURIComponent(val)}`;
}

function parseTagsFromForm(raw: string): GrowthLeadPerformanceTag[] {
  const set = new Set<GrowthLeadPerformanceTag>();
  for (const part of raw.split(/[,|]/)) {
    const u = part.trim().toUpperCase();
    if (u === "MUSIC") set.add("MUSIC");
    if (u === "COMEDY") set.add("COMEDY");
    if (u === "POETRY") set.add("POETRY");
    if (u === "VARIETY") set.add("VARIETY");
  }
  return [...set];
}

function parseLeadTypeForm(raw: string): GrowthLeadType | null {
  const u = raw.trim().toUpperCase();
  if (u === "VENUE") return "VENUE";
  if (u === "ARTIST") return "ARTIST";
  if (u === "PROMOTER_ACCOUNT" || u === "PROMOTER") return "PROMOTER_ACCOUNT";
  return null;
}

export async function createGrowthLeadAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();

  const name = String(formData.get("name") ?? "").trim();
  const leadType = parseLeadTypeForm(String(formData.get("leadType") ?? ""));
  if (!name || !leadType) redirect(q("/internal/admin/growth", "err", "badLead"));

  const emailRaw = String(formData.get("contactEmail") ?? "").trim();
  const contactUrl = String(formData.get("contactUrl") ?? "").trim() || null;
  const fitRaw = String(formData.get("fitScore") ?? "").trim();
  const fitScore = fitRaw ? Number.parseInt(fitRaw, 10) : null;
  const discoveryMarketSlug = String(formData.get("discoveryMarketSlug") ?? "").trim();
  if (!discoveryMarketSlug) redirect(q("/internal/admin/growth", "err", "needMarket"));

  const candidate: GrowthLeadCandidate = {
    leadType,
    name,
    contactEmailNormalized: emailRaw || null,
    allowPlaceholderEmail: String(formData.get("allowPlaceholderEmail") ?? "") === "on",
    contactUrl,
    websiteUrl: String(formData.get("websiteUrl") ?? "").trim() || null,
    instagramUrl: String(formData.get("instagramUrl") ?? "").trim() || null,
    youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
    tiktokUrl: String(formData.get("tiktokUrl") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    suburb: String(formData.get("suburb") ?? "").trim() || null,
    region: String(formData.get("region") ?? "").trim() || null,
    discoveryMarketSlug,
    source: String(formData.get("source") ?? "").trim() || "manual",
    sourceKind: "MANUAL_ADMIN",
    fitScore: Number.isFinite(fitScore as number) ? fitScore : null,
    discoveryConfidence: null,
    performanceTags: parseTagsFromForm(String(formData.get("tags") ?? "")),
    importKey: null,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
  };

  const ingested = await ingestGrowthLeadCandidate(prisma, candidate);
  if (ingested.status === "duplicate") {
    redirect(q("/internal/admin/growth", "err", "duplicateLead"));
  }
  if (ingested.status === "skipped") {
    redirect(q("/internal/admin/growth", "err", "badLead"));
  }

  revalidatePath("/internal/admin/growth");
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath("/internal/admin/growth/venues");
  revalidatePath("/internal/admin/growth/artists");
  revalidatePath("/internal/admin/growth/promoters");
  redirect(q("/internal/admin/growth", "ok", "created"));
}

export async function updateGrowthLeadStatusAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("leadId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as GrowthLeadStatus;
  if (!id || !status || !GROWTH_LEAD_STATUS_SET.has(status)) redirect(q("/internal/admin/growth", "err", "badStatus"));

  await prisma.growthLead.update({
    where: { id },
    data: { status },
  });

  if (status === "JOINED") {
    const row = await prisma.growthLead.findUnique({ where: { id }, select: { leadType: true } });
    if (row?.leadType === "VENUE") {
      await advanceGrowthLeadAcquisitionStage(prisma, id, "ACCOUNT_CREATED", { leadType: "VENUE" });
    }
  }

  revalidatePath("/internal/admin/growth");
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${id}`);
  redirect(q(`/internal/admin/growth/leads/${id}`, "ok", "status"));
}

const ACQUISITION_STAGES = new Set<GrowthLeadAcquisitionStage>([
  "DISCOVERED",
  "OUTREACH_DRAFTED",
  "OUTREACH_SENT",
  "CLICKED",
  "SIGNUP_STARTED",
  "ACCOUNT_CREATED",
  "LISTING_LIVE",
]);

export async function updateGrowthLeadAcquisitionStageAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("leadId") ?? "").trim();
  const stage = String(formData.get("acquisitionStage") ?? "").trim() as GrowthLeadAcquisitionStage;
  if (!id || !ACQUISITION_STAGES.has(stage)) redirect(q("/internal/admin/growth", "err", "badStage"));

  await prisma.growthLead.update({
    where: { id },
    data: { acquisitionStage: stage },
  });

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${id}`);
  redirect(q(`/internal/admin/growth/leads/${id}`, "ok", "acquisition"));
}

export async function updateGrowthLeadLocalityAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("leadId") ?? "").trim();
  if (!id) redirect(q("/internal/admin/growth", "err", "noLead"));

  await prisma.growthLead.update({
    where: { id },
    data: {
      city: String(formData.get("city") ?? "").trim() || null,
      suburb: String(formData.get("suburb") ?? "").trim() || null,
      region: String(formData.get("region") ?? "").trim() || null,
      discoveryMarketSlug: String(formData.get("discoveryMarketSlug") ?? "").trim() || null,
    },
  });

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${id}`);
  redirect(q(`/internal/admin/growth/leads/${id}`, "ok", "locality"));
}

export async function importGrowthLeadsCsvAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();

  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect(q("/internal/admin/growth", "err", "noFile"));
  }

  const text = await file.text();
  const defaults: CsvImportDefaults = {
    discoveryMarketSlug: String(formData.get("defaultDiscoveryMarketSlug") ?? "").trim() || null,
    city: String(formData.get("defaultCity") ?? "").trim() || null,
    suburb: String(formData.get("defaultSuburb") ?? "").trim() || null,
    region: String(formData.get("defaultRegion") ?? "").trim() || null,
    source: String(formData.get("defaultSource") ?? "").trim() || null,
    performanceTags: parseTagsFromForm(String(formData.get("defaultTags") ?? "")),
  };
  const { rows, errors } = parseGrowthLeadsFromCsv(text, defaults);
  let inserted = 0;
  let importDuplicates = 0;
  const rowErrors = [...errors];

  for (const r of rows) {
    const slug = r.discoveryMarketSlug?.trim();
    if (!slug) {
      rowErrors.push(`Row ${r.rowIndex}: missing discovery market slug`);
      continue;
    }
    const candidate: GrowthLeadCandidate = {
      leadType: r.leadType,
      name: r.name,
      contactEmailNormalized: r.contactEmailNormalized,
      contactUrl: r.contactUrl,
      websiteUrl: r.websiteUrl,
      instagramUrl: r.instagramUrl,
      youtubeUrl: r.youtubeUrl,
      tiktokUrl: r.tiktokUrl,
      city: r.city,
      suburb: r.suburb,
      region: r.region,
      discoveryMarketSlug: slug,
      source: r.source,
      sourceKind: "CSV_IMPORT",
      fitScore: r.fitScore,
      discoveryConfidence: null,
      performanceTags: r.performanceTags,
      importKey: r.importKey,
      internalNotes: null,
    };
    try {
      const res = await ingestGrowthLeadCandidate(prisma, candidate);
      if (res.status === "created") inserted++;
      else if (res.status === "duplicate") importDuplicates++;
      else rowErrors.push(`Row ${r.rowIndex}: ${res.reason}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rowErrors.push(`Row ${r.rowIndex}: ${msg.slice(0, 200)}`);
    }
  }

  revalidatePath("/internal/admin/growth");
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath("/internal/admin/growth/venues");
  revalidatePath("/internal/admin/growth/artists");
  revalidatePath("/internal/admin/growth/promoters");

  const failedCreates = rows.length - inserted - importDuplicates;
  if (rowErrors.length) console.error("[growth csv import]", rowErrors);
  redirect(
    `/internal/admin/growth?importInserted=${inserted}&importFailed=${failedCreates}&importDuplicates=${importDuplicates}&parseErrs=${errors.length}`,
  );
}

function claudeRowEmailStats(row: {
  contactEmail: string | null;
  additionalContactEmails: string[];
}) {
  const primary = parseGrowthLeadEmailInput(row.contactEmail ?? "", { extractedFromNoisyText: true });
  let additionalValid = 0;
  for (const e of row.additionalContactEmails) {
    const p = parseGrowthLeadEmailInput(e, { extractedFromNoisyText: true });
    if (p.kind === "valid") additionalValid++;
  }
  const hasPrimary = primary.kind === "valid";
  const hasAdditional = additionalValid > 0;
  return { hasPrimary, hasAdditional };
}

const LEAD_UPLOAD_FALLBACK_MARKET_SLUG = "manual-upload";

function resolveLeadUploadMarketSlug(row: {
  rowIndex: number;
  discoveryMarketSlug: string | null;
  city: string | null;
  suburb: string | null;
  websiteUrl: string | null;
}): { slug: string; warning: string | null } {
  const explicit = row.discoveryMarketSlug?.trim();
  if (explicit) return { slug: explicit, warning: null };

  const city = row.city?.trim();
  if (city) {
    const inferred = discoveryRollupSlugFromCityRegion(city, null);
    return {
      slug: inferred,
      warning: `Row ${row.rowIndex}: inferred discovery market slug "${inferred}" from city "${city}".`,
    };
  }

  const suburb = row.suburb?.trim();
  if (suburb) {
    const inferred = discoveryRollupSlugFromCityRegion(suburb, null);
    return {
      slug: inferred,
      warning: `Row ${row.rowIndex}: inferred discovery market slug "${inferred}" from suburb "${suburb}".`,
    };
  }

  const website = row.websiteUrl?.trim();
  if (website) {
    const inferredGeo = inferDiscoveryGeoForNationwideSearch({
      title: "",
      snippet: "",
      searchQuery: "",
      pageUrl: website,
    });
    const inferred = inferredGeo.discoveryMarketSlug;
    if (inferred?.trim()) {
      return {
        slug: inferred,
        warning: `Row ${row.rowIndex}: inferred discovery market slug "${inferred}" from website URL.`,
      };
    }
  }

  return {
    slug: LEAD_UPLOAD_FALLBACK_MARKET_SLUG,
    warning: `Row ${row.rowIndex}: discovery market slug missing; used fallback "${LEAD_UPLOAD_FALLBACK_MARKET_SLUG}".`,
  };
}

export async function importClaudeGrowthLeadsCsvAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();

  const file = formData.get("leadCsvFile") ?? formData.get("claudeCsvFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect(q("/internal/admin/growth", "err", "noFile"));
  }

  const text = await file.text();
  const { rows, errors } = parseClaudeGrowthLeadCsv(text);
  const batchId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  const importMetaNote = `[claude_csv import ${uploadedAt} batch=${batchId} file=${safeName}]`;

  const activeMarkets = await prisma.growthLaunchMarket.findMany({
    where: { status: "ACTIVE" },
    select: { discoveryMarketSlug: true },
  });
  const activeMarketSet = new Set(activeMarkets.map((m) => m.discoveryMarketSlug.trim().toLowerCase()));

  let inserted = 0;
  let updated = 0;
  let duplicateNoChange = 0;
  let ingestSkipped = 0;
  const rowErrors = [...errors];
  const rowWarnings: string[] = [];

  let primaryEmailRows = 0;
  let additionalEmailRows = 0;
  let contactPageOnlyRows = 0;
  let venueRows = 0;
  let artistRows = 0;
  let promoterRows = 0;
  const venueAutoEligibleLeadIds = new Set<string>();

  for (const r of rows) {
    const { hasPrimary, hasAdditional } = claudeRowEmailStats(r);
    const hasUsableEmail = hasPrimary || hasAdditional;
    if (!hasUsableEmail) {
      rowWarnings.push(`Row ${r.rowIndex}: skipped (no usable email in contactEmail/additionalContactEmails).`);
      ingestSkipped++;
      continue;
    }

    if (hasPrimary) primaryEmailRows++;
    if (hasAdditional) additionalEmailRows++;
    const hasPath = !!(
      r.contactUrl?.trim() ||
      r.websiteUrl?.trim() ||
      r.instagramUrl?.trim() ||
      r.facebookUrl?.trim()
    );
    if (!hasPrimary && !hasAdditional && hasPath) contactPageOnlyRows++;

    if (r.leadType === "VENUE") venueRows++;
    else if (r.leadType === "ARTIST") artistRows++;
    else if (r.leadType === "PROMOTER_ACCOUNT") promoterRows++;

    const market = resolveLeadUploadMarketSlug(r);
    if (market.warning) rowWarnings.push(market.warning);

    const importKey = `claude_csv:${batchId}:row:${r.rowIndex}`;
    const candidate: GrowthLeadCandidate = {
      leadType: r.leadType,
      name: r.name,
      contactEmailNormalized: r.contactEmail?.trim() || null,
      additionalContactEmails: r.additionalContactEmails,
      emailExtractedFromNoisyText: true,
      contactUrl: r.contactUrl,
      websiteUrl: r.websiteUrl,
      instagramUrl: r.instagramUrl,
      facebookUrl: r.facebookUrl,
      city: r.city,
      suburb: r.suburb,
      region: null,
      discoveryMarketSlug: market.slug,
      source: r.source?.trim() || "claude_csv",
      sourceKind: r.sourceKind,
      fitScore: r.fitScore,
      discoveryConfidence: null,
      performanceTags: [],
      importKey,
      internalNotes: r.internalNotes,
      openMicSignalTier: r.openMicSignalTier,
      contactQuality: r.contactQuality,
    };

    try {
      const res = await ingestGrowthLeadCandidate(prisma, candidate, {
        mergeOnDuplicate: { importMetaNote },
      });
      if (res.status === "created") {
        inserted++;
        const lead = await prisma.growthLead.findUnique({ where: { id: res.id } });
        if (
          lead &&
          venueLeadMatchesAutoDraftHeuristic(lead) &&
          lead.discoveryMarketSlug &&
          activeMarketSet.has(lead.discoveryMarketSlug.trim().toLowerCase())
        ) {
          venueAutoEligibleLeadIds.add(lead.id);
        }
      } else if (res.status === "duplicate") {
        if (res.merged) updated++;
        else duplicateNoChange++;
        const lead = await prisma.growthLead.findUnique({ where: { id: res.existingId } });
        if (
          lead &&
          venueLeadMatchesAutoDraftHeuristic(lead) &&
          lead.discoveryMarketSlug &&
          activeMarketSet.has(lead.discoveryMarketSlug.trim().toLowerCase())
        ) {
          venueAutoEligibleLeadIds.add(lead.id);
        }
      } else {
        ingestSkipped++;
        rowErrors.push(`Row ${r.rowIndex}: ${res.reason}`);
      }
    } catch (e) {
      ingestSkipped++;
      const msg = e instanceof Error ? e.message : String(e);
      rowErrors.push(`Row ${r.rowIndex}: ${msg.slice(0, 200)}`);
    }
  }

  revalidatePath("/internal/admin/growth");
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath("/internal/admin/growth/venues");
  revalidatePath("/internal/admin/growth/artists");
  revalidatePath("/internal/admin/growth/promoters");

  if (rowErrors.length) console.error("[growth claude csv import]", rowErrors);
  if (rowWarnings.length) console.warn("[growth lead upload warnings]", rowWarnings);

  const qParams = new URLSearchParams();
  qParams.set("leadUploadBatch", batchId);
  qParams.set("leadUploadFile", safeName);
  qParams.set("leadUploadRows", String(rows.length));
  qParams.set("leadUploadInserted", String(inserted));
  qParams.set("leadUploadUpdated", String(updated));
  qParams.set("leadUploadDup", String(duplicateNoChange));
  qParams.set("leadUploadSkipped", String(ingestSkipped));
  qParams.set("leadUploadParseErrs", String(errors.length));
  qParams.set("leadUploadPrimaryEmailRows", String(primaryEmailRows));
  qParams.set("leadUploadAdditionalEmailRows", String(additionalEmailRows));
  qParams.set("leadUploadContactPageOnlyRows", String(contactPageOnlyRows));
  qParams.set("leadUploadVenueRows", String(venueRows));
  qParams.set("leadUploadArtistRows", String(artistRows));
  qParams.set("leadUploadPromoterRows", String(promoterRows));
  qParams.set("leadUploadVenueAutoEligible", String(venueAutoEligibleLeadIds.size));
  qParams.set("leadUploadWarnCount", String(rowWarnings.length));
  if (rowWarnings.length > 0) {
    qParams.set("leadUploadWarnSample", rowWarnings.slice(0, 12).join(" || ").slice(0, 1800));
  }
  if (rowErrors.length > 0) {
    qParams.set("leadUploadErrorSample", rowErrors.slice(0, 12).join(" || ").slice(0, 1800));
  }

  redirect(`/internal/admin/growth?${qParams.toString()}`);
}

export async function generateGrowthLeadDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) redirect(q("/internal/admin/growth", "err", "noLead"));

  const r = await createPendingGrowthLeadOutreachDraft(prisma, leadId, { allowLowConfidenceEmail: true });
  if (!r.ok) {
    const key =
      r.reason === "Lead not found"
        ? "missingLead"
        : r.reason.includes("email")
          ? "needEmail"
          : r.reason.includes("already has")
            ? "draftExists"
            : "draftErr";
    redirect(q(`/internal/admin/growth/leads/${leadId}`, "err", key));
  }

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "draft"));
}

export async function approveGrowthLeadDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const id = String(formData.get("draftId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!id || !leadId) redirect(q("/internal/admin/growth", "err", "noDraft"));

  await prisma.growthLeadOutreachDraft.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByEmail: actor ?? null },
  });

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "approved"));
}

export async function rejectGrowthLeadDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const id = String(formData.get("draftId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!id || !leadId) redirect(q("/internal/admin/growth", "err", "noDraft"));

  await prisma.growthLeadOutreachDraft.updateMany({
    where: { id, status: { in: ["PENDING_REVIEW", "APPROVED"] } },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedByEmail: actor ?? null },
  });

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "rejected"));
}

export async function sendGrowthLeadDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const id = String(formData.get("draftId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!id || !leadId) redirect(q("/internal/admin/growth", "err", "noDraft"));

  const r = await sendGrowthLeadOutreachDraft(prisma, id, {
    actorEmail: actor,
    allowLowConfidenceEmail: true,
  });
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);

  if (!r.ok) {
    redirect(q(`/internal/admin/growth/leads/${leadId}`, "sendErr", r.reasons.join("|").slice(0, 200)));
  }
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "sent"));
}

export async function addGrowthLeadResponseAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const leadId = String(formData.get("leadId") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const channel = String(formData.get("channel") ?? "NOTE").trim();
  if (!leadId || !summary) redirect(q("/internal/admin/growth", "err", "response"));

  const ch = channel === "EMAIL" ? "EMAIL" : channel === "OTHER" ? "OTHER" : "NOTE";
  await prisma.growthLeadResponse.create({
    data: {
      leadId,
      channel: ch,
      summary,
      actorEmail: actor ?? null,
    },
  });

  if (ch === "EMAIL") {
    await prisma.growthLead.update({
      where: { id: leadId },
      data: { status: "REPLIED" },
    });
  }

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "logged"));
}

export async function createGrowthLeadFollowUpAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const leadId = String(formData.get("leadId") ?? "").trim();
  const runAfterRaw = String(formData.get("runAfter") ?? "").trim();
  const templateKey = String(formData.get("templateKey") ?? "").trim() || null;
  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";

  if (!leadId) redirect(q("/internal/admin/growth", "err", "noLead"));

  const runAfter = runAfterRaw ? new Date(runAfterRaw) : null;
  if (runAfter && Number.isNaN(runAfter.getTime())) {
    redirect(q(`/internal/admin/growth/leads/${leadId}`, "err", "badDate"));
  }

  await prisma.growthLeadFollowUpSchedule.create({
    data: {
      leadId,
      enabled,
      runAfter,
      templateKey,
      status: "PLANNED",
    },
  });

  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${leadId}`);
  redirect(q(`/internal/admin/growth/leads/${leadId}`, "ok", "followup"));
}
