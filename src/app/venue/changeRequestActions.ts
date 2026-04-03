"use server";

import { sendEmail } from "@/lib/mailer";
import { getContactInboxForServer } from "@/lib/contactInbox";
import { requireVenueSession } from "@/lib/authz";

export type VenueChangeRequestState =
  | { status: "idle" }
  | { status: "success"; devLogged?: boolean }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_URL = 2000;
const MAX_DETAILS = 10_000;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAllowedPageUrl(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 4 || t.length > MAX_URL) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.startsWith("/") && !t.startsWith("//")) return true;
  return false;
}

function safeAttachmentFilename(name: string): string {
  const base = name
    .replace(/^.*[/\\]/, "")
    .replace(/[^\w.\-()+ ]/g, "_")
    .slice(0, 120);
  return base || "attachment";
}

function mimeFromFilename(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return undefined;
}

export async function submitVenueChangeRequest(
  _prev: VenueChangeRequestState,
  formData: FormData,
): Promise<VenueChangeRequestState> {
  await requireVenueSession();

  const subject = String(formData.get("subject") ?? "").trim();
  const pageUrl = String(formData.get("pageUrl") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const file = formData.get("attachment");

  const fieldErrors: Record<string, string> = {};
  if (!subject) fieldErrors.subject = "Add a short subject.";
  else if (subject.length > MAX_SUBJECT) fieldErrors.subject = "Subject is too long.";

  if (!pageUrl) fieldErrors.pageUrl = "Paste the page URL.";
  else if (!isAllowedPageUrl(pageUrl)) {
    fieldErrors.pageUrl = "Use a full link (https://…) or a path starting with /.";
  }

  if (!details) fieldErrors.details = "Describe the change you need.";
  else if (details.length > MAX_DETAILS) fieldErrors.details = "Details are too long.";

  if (!email) fieldErrors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";

  let attachment: { filename: string; content: Buffer; contentType?: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      fieldErrors.attachment = `Attachment must be ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB or smaller.`;
    } else {
      const mime = file.type?.trim() || mimeFromFilename(file.name) || "";
      if (!ALLOWED_MIME.has(mime)) {
        fieldErrors.attachment = "Use a PDF or image (JPEG, PNG, GIF, WebP).";
      } else {
        const buf = Buffer.from(await file.arrayBuffer());
        attachment = {
          filename: safeAttachmentFilename(file.name),
          content: buf,
          contentType: mime,
        };
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Fix the highlighted fields.", fieldErrors };
  }

  const inbox = getContactInboxForServer();
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const isProd = process.env.NODE_ENV === "production";

  if (!inbox) {
    if (isProd) {
      return {
        status: "error",
        message:
          "Support inbox is not configured on this server. Please try again later or use the site contact page.",
      };
    }
    console.log("[venue change request] no inbox env — would send:", {
      email,
      subject,
      pageUrl,
      detailsPreview: details.slice(0, 200),
      hasAttachment: Boolean(attachment),
    });
    return { status: "success", devLogged: true };
  }

  if (isProd && !hasResend) {
    return {
      status: "error",
      message: "Email delivery is not configured. Please try again later.",
    };
  }

  const mailSubject = `[MicStage venue change] ${subject.slice(0, MAX_SUBJECT)}`;
  const textLines = [
    "Venue dashboard — change / update request",
    "",
    `Reply-To: ${email}`,
    `Page URL: ${pageUrl}`,
    "",
    details,
  ];
  if (attachment) textLines.push("", `(Attachment: ${attachment.filename})`);
  const text = textLines.join("\n");

  const html =
    "<p><strong>Venue change request</strong></p>" +
    "<p><strong>Reply-To:</strong> " +
    escapeHtml(email) +
    "</p>" +
    "<p><strong>Page URL:</strong> " +
    escapeHtml(pageUrl) +
    "</p>" +
    "<hr />" +
    '<pre style="white-space:pre-wrap;font-family:sans-serif;">' +
    escapeHtml(details) +
    "</pre>";

  try {
    if (!hasResend) {
      console.log("[venue change request] RESEND_API_KEY missing — dev log only", {
        to: inbox,
        subject: mailSubject,
      });
      return { status: "success", devLogged: true };
    }
    await sendEmail({
      to: inbox,
      subject: mailSubject,
      text,
      html,
      replyTo: email,
      attachments: attachment ? [attachment] : undefined,
    });
    return { status: "success" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[venue change request] send failed", msg);
    return {
      status: "error",
      message: "We could not send your request. Please try again in a few minutes.",
    };
  }
}
