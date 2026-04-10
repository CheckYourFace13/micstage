"use server";

import { assertAdminSession, getOptionalAdminEmailFromLoginForm } from "@/lib/adminAuth";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { CsvImportDefaults } from "@/lib/growth/csvImport";
import { parseGrowthLeadsFromCsv } from "@/lib/growth/csvImport";
import { ingestGrowthLeadCandidate } from "@/lib/growth/growthLeadIngest";
import { createPendingGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadOutreachDraftCreate";
import { GROWTH_LEAD_STATUS_SET } from "@/lib/growth/growthLeadStatusSet";
import { sendGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadDraftSend";
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
