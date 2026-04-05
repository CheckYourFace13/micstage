"use server";

import { assertAdminSession, getOptionalAdminEmailFromLoginForm } from "@/lib/adminAuth";
import { buildGrowthLeadOutreachPayload } from "@/lib/growth/outreachEmailBodies";
import type { CsvImportDefaults } from "@/lib/growth/csvImport";
import { parseGrowthLeadsFromCsv } from "@/lib/growth/csvImport";
import { GROWTH_LEAD_STATUS_SET } from "@/lib/growth/growthLeadStatusSet";
import { sendGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadDraftSend";
import type { GrowthLeadPerformanceTag, GrowthLeadStatus, GrowthLeadType } from "@/generated/prisma/client";
import { MarketingContactStatus } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
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

  const email = normalizeMarketingEmail(String(formData.get("contactEmail") ?? ""));
  const contactUrl = String(formData.get("contactUrl") ?? "").trim() || null;
  const fitRaw = String(formData.get("fitScore") ?? "").trim();
  const fitScore = fitRaw ? Number.parseInt(fitRaw, 10) : null;

  await prisma.growthLead.create({
    data: {
      name,
      leadType,
      contactEmailNormalized: email || null,
      contactUrl,
      websiteUrl: String(formData.get("websiteUrl") ?? "").trim() || null,
      instagramUrl: String(formData.get("instagramUrl") ?? "").trim() || null,
      youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
      tiktokUrl: String(formData.get("tiktokUrl") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      suburb: String(formData.get("suburb") ?? "").trim() || null,
      region: String(formData.get("region") ?? "").trim() || null,
      discoveryMarketSlug: String(formData.get("discoveryMarketSlug") ?? "").trim() || null,
      source: String(formData.get("source") ?? "").trim() || "manual",
      fitScore: Number.isFinite(fitScore as number) ? fitScore : null,
      performanceTags: parseTagsFromForm(String(formData.get("tags") ?? "")),
      internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
      status: "DISCOVERED",
    },
  });

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

  revalidatePath("/internal/admin/growth");
  revalidatePath("/internal/admin/growth/leads");
  revalidatePath(`/internal/admin/growth/leads/${id}`);
  redirect(q(`/internal/admin/growth/leads/${id}`, "ok", "status"));
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
  const rowErrors = [...errors];

  for (const r of rows) {
    try {
      await prisma.growthLead.create({
        data: {
          name: r.name,
          leadType: r.leadType,
          contactEmailNormalized: r.contactEmailNormalized,
          contactUrl: r.contactUrl,
          websiteUrl: r.websiteUrl,
          instagramUrl: r.instagramUrl,
          youtubeUrl: r.youtubeUrl,
          tiktokUrl: r.tiktokUrl,
          city: r.city,
          suburb: r.suburb,
          region: r.region,
          discoveryMarketSlug: r.discoveryMarketSlug,
          source: r.source,
          fitScore: r.fitScore,
          performanceTags: r.performanceTags,
          importKey: r.importKey,
          status: "DISCOVERED",
        },
      });
      inserted++;
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

  const failedCreates = rows.length - inserted;
  if (rowErrors.length) console.error("[growth csv import]", rowErrors);
  redirect(
    `/internal/admin/growth?importInserted=${inserted}&importFailed=${failedCreates}&parseErrs=${errors.length}`,
  );
}

export async function generateGrowthLeadDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) redirect(q("/internal/admin/growth", "err", "noLead"));

  const lead = await prisma.growthLead.findUnique({ where: { id: leadId } });
  if (!lead) redirect(q("/internal/admin/growth", "err", "missingLead"));

  const email = lead.contactEmailNormalized ? normalizeMarketingEmail(lead.contactEmailNormalized) : null;
  if (!email) {
    redirect(q(`/internal/admin/growth/leads/${leadId}`, "err", "needEmail"));
  }

  const payload = buildGrowthLeadOutreachPayload({
    leadType: lead.leadType,
    name: lead.name,
    city: lead.city,
    discoveryMarketSlug: lead.discoveryMarketSlug,
    contactUrl: lead.contactUrl,
    websiteUrl: lead.websiteUrl,
  });

  const contact = await prisma.marketingContact.upsert({
    where: { emailNormalized: email },
    create: {
      emailNormalized: email,
      displayName: lead.name,
      discoveryMarketSlug: lead.discoveryMarketSlug ?? undefined,
      source: "growth-lead",
      status: MarketingContactStatus.ACTIVE,
    },
    update: {
      displayName: lead.name,
      discoveryMarketSlug: lead.discoveryMarketSlug ?? undefined,
    },
  });

  await prisma.growthLeadOutreachDraft.create({
    data: {
      leadId: lead.id,
      contactId: contact.id,
      toEmailNormalized: email,
      status: "PENDING_REVIEW",
      subject: payload.subject,
      textBody: payload.textBody,
      htmlBody: payload.htmlBody,
      discoveryMarketSlug: lead.discoveryMarketSlug,
    },
  });

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

  const r = await sendGrowthLeadOutreachDraft(prisma, id, { actorEmail: actor });
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
