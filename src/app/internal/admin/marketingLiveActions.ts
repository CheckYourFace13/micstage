"use server";

import { assertAdminSession, getOptionalAdminEmailFromLoginForm } from "@/lib/adminAuth";
import { enqueueMarketingJobWithAudit } from "@/lib/marketing/jobQueue";
import { sendApprovedOutreachDraft } from "@/lib/marketing/outreachDraftSend";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { sendThroughMarketingPipeline } from "@/lib/marketing/sendPipeline";
import { MARKETING_TEMPLATE_KINDS } from "@/lib/marketing/templateKinds";
import { loadVenueOutreachDraft } from "@/lib/marketing/venueOutreachDrafts";
import type { Prisma } from "@/generated/prisma/client";
import { MarketingContactStatus } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function qmsg(base: string, key: string, val: string) {
  return `${base}?${key}=${encodeURIComponent(val)}`;
}

export async function adminEnqueueMarketingInfraSelfTestAction() {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actorEmail = await getOptionalAdminEmailFromLoginForm();
  try {
    await enqueueMarketingJobWithAudit(prisma, {
      kind: "INDEXABILITY_SNAPSHOT",
      actorEmail,
      payload: { source: "admin-self-test", at: new Date().toISOString() },
      idempotencyKey: `infra-self-test:${Date.now()}`,
    });
    revalidatePath("/internal/admin/marketing");
  } catch {
    redirect("/internal/admin/marketing?selfTest=err");
  }
  redirect("/internal/admin/marketing?selfTest=ok");
}

export async function adminCreateOutreachDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const venueId = String(formData.get("venueId") ?? "").trim();
  const toRaw = String(formData.get("toEmail") ?? "").trim();
  if (!venueId) redirect(qmsg("/internal/admin/marketing", "draftErr", "missingVenue"));

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { owner: true },
  });
  if (!venue) redirect(qmsg("/internal/admin/marketing", "draftErr", "venueNotFound"));

  const toEmail = normalizeMarketingEmail(toRaw || venue.owner.email);
  if (!toEmail) redirect(qmsg("/internal/admin/marketing", "draftErr", "badEmail"));

  const draftContent = await loadVenueOutreachDraft(prisma, venueId);
  if (!draftContent) redirect(qmsg("/internal/admin/marketing", "draftErr", "noDraftContent"));

  const contact = await prisma.marketingContact.upsert({
    where: { emailNormalized: toEmail },
    create: {
      emailNormalized: toEmail,
      venueId,
      discoveryMarketSlug: draftContent.discoveryMarketSlug ?? undefined,
      source: "outreach-draft",
      status: MarketingContactStatus.ACTIVE,
    },
    update: {
      venueId,
      discoveryMarketSlug: draftContent.discoveryMarketSlug ?? undefined,
    },
  });

  await prisma.marketingOutreachDraft.create({
    data: {
      venueId,
      contactId: contact.id,
      toEmailNormalized: toEmail,
      status: "PENDING_REVIEW",
      subject: draftContent.emailPayload.subject,
      textBody: draftContent.emailPayload.textBody,
      htmlBody: draftContent.emailPayload.htmlBody,
      discoveryMarketSlug: draftContent.discoveryMarketSlug,
    },
  });

  await prisma.marketingEvent.create({
    data: {
      type: "DRAFT_MATERIALIZED",
      venueId,
      actorEmail: actor ?? undefined,
      discoveryMarketSlug: draftContent.discoveryMarketSlug ?? undefined,
      payload: { kind: "outreach_cold", toEmail } as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/internal/admin/marketing");
  redirect(qmsg("/internal/admin/marketing", "draftOk", "1"));
}

export async function adminApproveOutreachDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) redirect(qmsg("/internal/admin/marketing", "apprErr", "missing"));

  await prisma.marketingOutreachDraft.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByEmail: actor ?? null },
  });

  revalidatePath("/internal/admin/marketing");
  redirect(qmsg("/internal/admin/marketing", "apprOk", id));
}

export async function adminRejectOutreachDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const actor = await getOptionalAdminEmailFromLoginForm();
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) redirect(qmsg("/internal/admin/marketing", "rejErr", "missing"));

  await prisma.marketingOutreachDraft.updateMany({
    where: { id, status: { in: ["PENDING_REVIEW", "APPROVED"] } },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedByEmail: actor ?? null },
  });

  revalidatePath("/internal/admin/marketing");
  redirect(qmsg("/internal/admin/marketing", "rejOk", id));
}

export async function adminSendOutreachDraftAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) redirect(qmsg("/internal/admin/marketing", "sendErr", "missing"));

  const r = await sendApprovedOutreachDraft(prisma, id);
  revalidatePath("/internal/admin/marketing");
  if (!r.ok) {
    redirect(qmsg("/internal/admin/marketing", "sendErr", r.reasons.join("|").slice(0, 200)));
  }
  redirect(qmsg("/internal/admin/marketing", "sendOk", id));
}

export async function adminSendBulkOutreachDraftsAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const ids = formData.getAll("draftId").map((v) => String(v).trim()).filter(Boolean);
  if (ids.length === 0) redirect(qmsg("/internal/admin/marketing", "bulkErr", "none"));

  const errors: string[] = [];
  for (const id of ids) {
    const r = await sendApprovedOutreachDraft(prisma, id);
    if (!r.ok) errors.push(`${id}:${r.reasons.join(";")}`);
  }
  revalidatePath("/internal/admin/marketing");
  if (errors.length) {
    redirect(qmsg("/internal/admin/marketing", "bulkErr", errors.join("||").slice(0, 1800)));
  }
  redirect(qmsg("/internal/admin/marketing", "bulkOk", String(ids.length)));
}

export async function adminMarketingTestSendAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const to = normalizeMarketingEmail(String(formData.get("testEmail") ?? ""));
  if (!to) redirect(qmsg("/internal/admin/marketing", "testErr", "email"));

  const r = await sendThroughMarketingPipeline(prisma, {
    to,
    category: "outreach",
    templateKind: MARKETING_TEMPLATE_KINDS.ADMIN_MANUAL_TEST,
    purposeKey: `admin-test:${Date.now()}`,
    subject: "[MicStage beta] Admin mail test",
    htmlBody: "<p>This is a controlled live send from the MicStage admin marketing console.</p>",
    textBody: "MicStage admin marketing test send.",
  });

  revalidatePath("/internal/admin/marketing");
  if (!r.ok) {
    redirect(qmsg("/internal/admin/marketing", "testErr", r.reasons.join("|").slice(0, 200)));
  }
  redirect(qmsg("/internal/admin/marketing", "testOk", "1"));
}

export async function adminDeliverabilitySeedTestAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const to = normalizeMarketingEmail(String(formData.get("seedEmail") ?? ""));
  if (!to) redirect(qmsg("/internal/admin/marketing", "seedErr", "email"));

  const inner = `
<p><strong>MicStage deliverability seed</strong></p>
<p>Send this to inboxes you control in <strong>Gmail</strong> and <strong>Outlook</strong> (Microsoft 365 or consumer).</p>
<ol>
<li><strong>Gmail:</strong> Open the ⋮ menu → check List-Unsubscribe / one-click; note Primary vs Promotions placement.</li>
<li><strong>Outlook:</strong> Compare Focused vs Other; open View → message source for authentication results.</li>
<li>Keep volume conservative; raise <code>MARKETING_CAP_*</code> only when deliverability is stable.</li>
</ol>
<p>Template: ADMIN_DELIVERABILITY_SEED · category: marketing (commercial footer + List-Unsubscribe-Post).</p>
`.trim();

  const r = await sendThroughMarketingPipeline(prisma, {
    to,
    category: "marketing",
    templateKind: MARKETING_TEMPLATE_KINDS.ADMIN_DELIVERABILITY_SEED,
    purposeKey: `admin-deliverability-seed:${Date.now()}`,
    subject: "[MicStage placement] Gmail + Outlook seed checklist",
    htmlBody: `<div style="font-family:system-ui,sans-serif;line-height:1.55;color:#111">${inner}</div>`,
    textBody: [
      "MicStage deliverability seed (Gmail + Outlook).",
      "",
      "Gmail: check one-click unsub + tab placement.",
      "Outlook: Focused vs Other + auth headers.",
      "Keep sends under configured daily caps.",
    ].join("\n"),
  });

  revalidatePath("/internal/admin/marketing");
  if (!r.ok) {
    redirect(qmsg("/internal/admin/marketing", "seedErr", r.reasons.join("|").slice(0, 200)));
  }
  redirect(qmsg("/internal/admin/marketing", "seedOk", "1"));
}
