import { Resend } from "resend";
import type { MicStageEmailCategory } from "@/lib/marketing/emailConfig";
import { fromAddressForMicStageCategory } from "@/lib/marketing/emailConfig";

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function replyToEmail() {
  const v = process.env.EMAIL_REPLY_TO?.trim();
  return v || undefined;
}

export type DeliverResendResult = { messageId?: string; skipped?: boolean };

/**
 * Low-level Resend send with category-based From separation. Returns Resend email id when available.
 */
export async function deliverResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  category?: MicStageEmailCategory;
  fromOverride?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  /** When true (default for transactional), missing API key in dev logs only. When false, missing key throws in all envs. */
  allowDevSkipWhenNoApiKey?: boolean;
}): Promise<DeliverResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const category = input.category ?? "transactional";
  const allowSkip = input.allowDevSkipWhenNoApiKey !== false;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production" && !allowSkip) {
      const msg = "RESEND_API_KEY is missing in production.";
      console.error("[mailer]", msg, { toDomain: input.to.split("@")[1] ?? "?" });
      throw new Error(msg);
    }
    if (process.env.NODE_ENV === "production" && allowSkip) {
      const msg =
        "RESEND_API_KEY is missing in production. Set it and EMAIL_FROM (verified domain) so password resets can send.";
      console.error("[mailer]", msg, { toDomain: input.to.split("@")[1] ?? "?" });
      throw new Error(msg);
    }
    console.log("[mailer] EMAIL_FALLBACK (no RESEND_API_KEY)", {
      to: input.to,
      subject: input.subject,
      category,
      appUrl: appUrl(),
    });
    return { skipped: true };
  }

  const fromAddr = input.fromOverride?.trim() || fromAddressForMicStageCategory(category);
  if (fromAddr.includes("onboarding@resend.dev")) {
    console.warn("[mailer] From is still resend.dev default; verify your domain in Resend.", { from: fromAddr });
  }

  const resend = new Resend(apiKey);
  const replyTo = input.replyTo || replyToEmail();
  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: fromAddr,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo,
    headers: input.headers,
  };
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));
  }

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    console.error("[mailer] Resend API rejected send", {
      message: error.message,
      name: error.name,
      toDomain: input.to.split("@")[1] ?? "?",
      category,
    });
    throw new Error(`Resend: ${error.message}`);
  }
  return { messageId: data?.id };
}

/** Product/transactional email (password reset, reminders, contact form). */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  await deliverResendEmail({
    ...input,
    category: "transactional",
    allowDevSkipWhenNoApiKey: true,
  });
}
