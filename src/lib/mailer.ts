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

export type MailFailurePhase =
  | "before_provider_call"
  | "during_provider_call"
  | "after_provider_acceptance";

class MailProviderError extends Error {
  phase: MailFailurePhase;
  provider: "resend";
  httpStatus?: number;
  providerMessageId?: string;
  providerErrorName?: string;
  constructor(input: {
    message: string;
    phase: MailFailurePhase;
    httpStatus?: number;
    providerMessageId?: string;
    providerErrorName?: string;
  }) {
    super(input.message);
    this.name = "MailProviderError";
    this.phase = input.phase;
    this.provider = "resend";
    this.httpStatus = input.httpStatus;
    this.providerMessageId = input.providerMessageId;
    this.providerErrorName = input.providerErrorName;
  }
}

export { MailProviderError };

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
      throw new MailProviderError({ message: msg, phase: "before_provider_call" });
    }
    if (process.env.NODE_ENV === "production" && allowSkip) {
      const msg =
        "RESEND_API_KEY is missing in production. Set it and EMAIL_FROM (verified domain) so password resets can send.";
      console.error("[mailer]", msg, { toDomain: input.to.split("@")[1] ?? "?" });
      throw new MailProviderError({ message: msg, phase: "before_provider_call" });
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
    const status = (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status;
    console.error("[mailer] Resend API rejected send", {
      message: error.message,
      name: error.name,
      status,
      toDomain: input.to.split("@")[1] ?? "?",
      category,
    });
    throw new MailProviderError({
      message: `Resend: ${error.message}`,
      phase: "during_provider_call",
      httpStatus: typeof status === "number" ? status : undefined,
      providerErrorName: error.name,
    });
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
