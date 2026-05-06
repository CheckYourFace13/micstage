import crypto from "node:crypto";
import type { PrismaClient, PromoterApplicationStatus, PromoterReviewAction } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { ownerSummaryRecipient } from "@/lib/ownerSummary/ownerSummaryConfig";
import { absoluteUrl } from "@/lib/publicSeo";

const DEFAULT_REVIEW_TOKEN_TTL_HOURS = 72;

type NewPromoterApplicationInput = {
  contactName: string;
  email: string;
  cityRegion?: string;
  brandName?: string;
  socialUrl?: string;
  notes?: string;
};

export function promoterApprovalInbox(): string {
  return process.env.MICSTAGE_PROMOTER_APPROVAL_INBOX?.trim() || ownerSummaryRecipient();
}

function reviewTokenSecret(): string {
  return (
    process.env.PROMOTER_REVIEW_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.MICSTAGE_ADMIN_SECRET?.trim() ||
    ""
  );
}

function reviewTokenTtlHours(): number {
  const raw = process.env.PROMOTER_REVIEW_TOKEN_TTL_HOURS?.trim();
  if (!raw) return DEFAULT_REVIEW_TOKEN_TTL_HOURS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REVIEW_TOKEN_TTL_HOURS;
}

function hashToken(rawToken: string): string {
  const secret = reviewTokenSecret();
  return crypto
    .createHash("sha256")
    .update(`${secret}:${rawToken}`)
    .digest("hex");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reviewActionToStatus(action: PromoterReviewAction): PromoterApplicationStatus {
  return action === "APPROVE" ? "APPROVED" : "REJECTED";
}

async function createReviewToken(
  prisma: PrismaClient,
  applicationId: string,
  action: PromoterReviewAction,
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + reviewTokenTtlHours() * 60 * 60 * 1000);
  await prisma.promoterApplicationReviewToken.create({
    data: {
      applicationId,
      action,
      tokenHash,
      expiresAt,
    },
  });
  return rawToken;
}

async function sendApplicationNotificationEmail(
  app: {
    id: string;
    contactName: string;
    email: string;
    cityRegion: string | null;
    brandName: string | null;
    socialUrl: string | null;
    notes: string | null;
  },
  approveToken: string,
  rejectToken: string,
): Promise<void> {
  const approveUrl = absoluteUrl(`/api/promoter-applications/review?token=${encodeURIComponent(approveToken)}`);
  const rejectUrl = absoluteUrl(`/api/promoter-applications/review?token=${encodeURIComponent(rejectToken)}`);
  const to = promoterApprovalInbox();
  const subject = `Promoter application: ${app.contactName}`;

  const detailsText = [
    `Application id: ${app.id}`,
    `Name: ${app.contactName}`,
    `Email: ${app.email}`,
    `City/region: ${app.cityRegion || "-"}`,
    `Brand/event name: ${app.brandName || "-"}`,
    `Social/profile URL: ${app.socialUrl || "-"}`,
    "",
    "Notes:",
    app.notes || "-",
    "",
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
  ].join("\n");

  const detailsHtml = [
    `<p><strong>Application id:</strong> ${escapeHtml(app.id)}</p>`,
    `<p><strong>Name:</strong> ${escapeHtml(app.contactName)}<br/>`,
    `<strong>Email:</strong> ${escapeHtml(app.email)}<br/>`,
    `<strong>City/region:</strong> ${escapeHtml(app.cityRegion || "-")}<br/>`,
    `<strong>Brand/event name:</strong> ${escapeHtml(app.brandName || "-")}<br/>`,
    `<strong>Social/profile URL:</strong> ${escapeHtml(app.socialUrl || "-")}</p>`,
    `<p><strong>Notes</strong><br/>${escapeHtml(app.notes || "-").replace(/\n/g, "<br/>")}</p>`,
    `<p><a href="${escapeHtml(approveUrl)}">Approve promoter application</a></p>`,
    `<p><a href="${escapeHtml(rejectUrl)}">Reject promoter application</a></p>`,
  ].join("");

  await deliverResendEmail({
    to,
    subject,
    text: detailsText,
    html: detailsHtml,
    category: "transactional",
    allowDevSkipWhenNoApiKey: true,
  });
}

async function sendApplicantDecisionEmail(input: {
  to: string;
  status: PromoterApplicationStatus;
}): Promise<void> {
  const approved = input.status === "APPROVED";
  const subject = approved
    ? "MicStage promoter application approved"
    : "MicStage promoter application update";
  const registerUrl = absoluteUrl("/register/promoter");
  const text = approved
    ? [
        "Thanks for applying to run promoter-led nights through MicStage.",
        "",
        "Your promoter application is approved.",
        "",
        "Next step: create your promoter account with the same email you applied with:",
        registerUrl,
        "",
        `If you need help launching your first nights, contact us: ${absoluteUrl("/contact")}`,
      ].join("\n")
    : [
        "Thanks for applying to run promoter-led nights through MicStage.",
        "",
        "Your promoter application is not approved at this time.",
        "",
        `If you want to share more details, reply through ${absoluteUrl("/contact")}.`,
      ].join("\n");
  const html = approved
    ? `<p>${escapeHtml(
        [
          "Thanks for applying to run promoter-led nights through MicStage.",
          "",
          "Your promoter application is approved.",
          "",
          "Next: create your promoter account with the same email you applied with.",
        ].join("\n"),
      ).replace(/\n/g, "<br/>")}</p><p><a href="${escapeHtml(registerUrl)}">${escapeHtml(registerUrl)}</a></p><p>${escapeHtml(
        `Questions? ${absoluteUrl("/contact")}`,
      )}</p>`
    : `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;

  await deliverResendEmail({
    to: input.to,
    subject,
    text,
    html,
    category: "transactional",
    allowDevSkipWhenNoApiKey: true,
  });
}

export async function createPromoterApplicationAndNotify(
  prisma: PrismaClient,
  input: NewPromoterApplicationInput,
): Promise<{ id: string }> {
  const app = await prisma.promoterApplication.create({
    data: {
      contactName: input.contactName,
      email: input.email,
      cityRegion: input.cityRegion,
      brandName: input.brandName,
      socialUrl: input.socialUrl,
      notes: input.notes,
    },
    select: {
      id: true,
      contactName: true,
      email: true,
      cityRegion: true,
      brandName: true,
      socialUrl: true,
      notes: true,
    },
  });

  try {
    const [approveToken, rejectToken] = await Promise.all([
      createReviewToken(prisma, app.id, "APPROVE"),
      createReviewToken(prisma, app.id, "REJECT"),
    ]);
    await sendApplicationNotificationEmail(app, approveToken, rejectToken);
  } catch (e) {
    console.error("[promoterApplications] notification email failed", { applicationId: app.id, err: e });
  }

  return { id: app.id };
}

export async function reviewPromoterApplicationByToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<{ ok: true; status: PromoterApplicationStatus } | { ok: false; reason: string }> {
  const tokenHash = hashToken(rawToken);
  const tokenRow = await prisma.promoterApplicationReviewToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      action: true,
      expiresAt: true,
      usedAt: true,
      applicationId: true,
      application: { select: { id: true, status: true, email: true } },
    },
  });
  if (!tokenRow) return { ok: false, reason: "invalid_token" };
  if (tokenRow.usedAt) return { ok: false, reason: "token_already_used" };
  if (tokenRow.expiresAt.getTime() < Date.now()) return { ok: false, reason: "token_expired" };
  if (tokenRow.application.status !== "PENDING") return { ok: false, reason: "already_reviewed" };

  const newStatus = reviewActionToStatus(tokenRow.action);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const used = await tx.promoterApplicationReviewToken.updateMany({
      where: { id: tokenRow.id, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count === 0) throw new Error("review_token_race");

    const updated = await tx.promoterApplication.updateMany({
      where: { id: tokenRow.applicationId, status: "PENDING" },
      data: { status: newStatus, reviewedAt: now },
    });
    if (updated.count === 0) throw new Error("application_already_reviewed");

    await tx.promoterApplicationReviewToken.updateMany({
      where: { applicationId: tokenRow.applicationId, usedAt: null },
      data: { usedAt: now },
    });
  });

  try {
    await sendApplicantDecisionEmail({ to: tokenRow.application.email, status: newStatus });
  } catch (e) {
    console.error("[promoterApplications] applicant decision email failed", {
      applicationId: tokenRow.application.id,
      err: e,
    });
  }

  return { ok: true, status: newStatus };
}
