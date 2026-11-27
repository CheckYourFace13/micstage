"use server";

import { createHash } from "node:crypto";
import { sendEmail } from "@/lib/mailer";
import { getContactInboxForServer } from "@/lib/contactInbox";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/contact/contactFormFields";
import {
  CONTACT_ACCEPTED_EVENT_KIND,
  CONTACT_QUARANTINE_EVENT_KIND,
  contactDuplicateHash,
  guardContactSubmission,
  recordContactAudit,
} from "@/lib/contactFormGuard";
import { CONTACT_CATEGORIES } from "./categories";

export type ContactFormState =
  | { status: "idle" }
  | { status: "success"; devLogged?: boolean }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function categoryLabel(value: string): string {
  const row = CONTACT_CATEGORIES.find((c) => c.value === value);
  return row ? row.label : value;
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function submitContactForm(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const companyWebsite = String(formData.get(CONTACT_HONEYPOT_FIELD) ?? "");
  const turnstileToken = String(
    formData.get("cf-turnstile-response") ?? formData.get("turnstileToken") ?? "",
  );

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required.";
  else if (name.length > 200) fieldErrors.name = "Name is too long.";
  if (!email) fieldErrors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  else if (email.length > 320) fieldErrors.email = "Email is too long.";
  if (!category) fieldErrors.category = "Choose a category.";
  else if (!CONTACT_CATEGORIES.some((c) => c.value === category)) {
    fieldErrors.category = "Invalid category.";
  }
  if (!details) fieldErrors.details = "Please add a message.";
  else if (details.length < 8) fieldErrors.details = "Please add a bit more detail.";
  else if (details.length > 10000) fieldErrors.details = "Message is too long.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Fix the highlighted fields.", fieldErrors };
  }

  const guard = await guardContactSubmission({
    name,
    email,
    category,
    details,
    companyWebsite,
    turnstileToken,
  });

  const detailsHash = contactDuplicateHash(email, details);
  const eHash = emailHash(email);

  if (guard.action === "reject") {
    return {
      status: "error",
      message: guard.message,
      fieldErrors: guard.fieldErrors,
    };
  }

  if (guard.action === "quarantine") {
    await recordContactAudit({
      kind: CONTACT_QUARANTINE_EVENT_KIND,
      reason: guard.reason,
      category,
      emailHash: eHash,
      detailsHash,
    });
    return { status: "success" };
  }

  const inbox = getContactInboxForServer();
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const isProd = process.env.NODE_ENV === "production";

  if (!inbox) {
    if (isProd) {
      return {
        status: "error",
        message:
          "Contact is not configured on this server. Please try again later or reach out through another channel you already use with MicStage.",
      };
    }
    console.log("[contact] no inbox env — would send:", {
      category,
      detailsPreview: details.slice(0, 200),
    });
    return { status: "success", devLogged: true };
  }

  if (isProd && !hasResend) {
    return {
      status: "error",
      message: "Email delivery is not configured. Please try again later.",
    };
  }

  const catLabel = categoryLabel(category);
  const subject = `[MicStage contact] ${catLabel} — ${name.slice(0, 80)}`;
  const text = [`Category: ${catLabel}`, `From: ${name} <${email}>`, "", details].join("\n");

  const html =
    "<p><strong>Category:</strong> " +
    escapeHtml(catLabel) +
    "</p>" +
    "<p><strong>From:</strong> " +
    escapeHtml(name) +
    " &lt;" +
    escapeHtml(email) +
    "&gt;</p>" +
    "<hr />" +
    '<pre style="white-space:pre-wrap;font-family:sans-serif;">' +
    escapeHtml(details) +
    "</pre>";

  try {
    if (!hasResend) {
      console.log("[contact] RESEND_API_KEY missing — dev log only", { to: inbox, subject });
      return { status: "success", devLogged: true };
    }
    await sendEmail({ to: inbox, subject, text, html });
    await recordContactAudit({
      kind: CONTACT_ACCEPTED_EVENT_KIND,
      category,
      emailHash: eHash,
      detailsHash,
    });
    return { status: "success" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[contact] send failed", msg);
    return {
      status: "error",
      message: "We could not send your message. Please try again in a few minutes.",
    };
  }
}
