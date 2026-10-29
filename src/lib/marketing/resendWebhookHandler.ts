import { Webhook } from "svix";
import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { recordMarketingProviderWebhook } from "@/lib/marketing/marketingWebhook";
import { ingestInboundCorrectionReply } from "@/lib/marketing/ingestInboundCorrectionReply";

type ResendAddress = string | { email?: string; address?: string } | null | undefined;

type ResendWebhookBody = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: ResendAddress;
    to?: ResendAddress[] | string;
    subject?: string;
    text?: string;
    html?: string;
    bounce?: { message?: string; type?: string; subType?: string; diagnosticCode?: string[] };
  };
};

function extractAddress(value: ResendAddress | ResendAddress[] | string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return extractAddress(value[0]);
  return value.email ?? value.address ?? "";
}

/** Resend marks Permanent vs Transient; only true soft Transient is excluded from suppression + health. */
export function isResendHardBounce(
  bounce:
    | {
        type?: string;
        message?: string;
        subType?: string;
        diagnosticCode?: string[] | string | null;
      }
    | null
    | undefined,
): boolean {
  const diag = Array.isArray(bounce?.diagnosticCode)
    ? bounce.diagnosticCode.join(" ")
    : typeof bounce?.diagnosticCode === "string"
      ? bounce.diagnosticCode
      : "";
  const msg = `${bounce?.message ?? ""} ${diag} ${bounce?.subType ?? ""}`.toLowerCase();

  // Explicit mailbox-full / retryable storage soft signals.
  if (
    bounce?.subType === "MailboxFull" ||
    /inbox was full|mailbox (is )?full|quota exceeded|out of storage/.test(msg)
  ) {
    return false;
  }

  // Permanent-looking SMTP diagnostics even if Resend typed Transient (e.g. invalid domain).
  if (/invalid domain|no such user|user unknown|address does not exist|5\.1\.1|5\.4\.4/.test(msg)) {
    return true;
  }

  const t = (bounce?.type ?? "").trim().toLowerCase();
  if (!t) {
    if (/try again later|temporary/.test(msg)) return false;
    return true;
  }
  if (t === "transient" || t === "soft" || t === "temporary") return false;
  if (t === "permanent" || t === "hard") return true;
  return true;
}

function webhookSecret(): string | null {
  return process.env.RESEND_WEBHOOK_SECRET?.trim() || null;
}

/** Verify Resend/Svix webhook using official Svix library. */
export function verifyResendWebhookPayload(
  rawBody: string,
  headers: { svixId?: string | null; svixTimestamp?: string | null; svixSignature?: string | null },
): ResendWebhookBody | null {
  const secret = webhookSecret();
  if (!secret) return null;
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) return null;
  try {
    const wh = new Webhook(secret);
    return wh.verify(rawBody, {
      "svix-id": headers.svixId,
      "svix-timestamp": headers.svixTimestamp,
      "svix-signature": headers.svixSignature,
    }) as ResendWebhookBody;
  } catch {
    return null;
  }
}

async function suppressMarketingContact(
  prisma: PrismaClient,
  email: string,
  reason: "HARD_BOUNCE" | "COMPLAINT",
): Promise<void> {
  const emailNormalized = normalizeMarketingEmail(email);
  if (!emailNormalized) return;

  await prisma.marketingEmailSuppression.upsert({
    where: { emailNormalized },
    create: { emailNormalized, reason, sourceNote: "resend_webhook" },
    update: { reason, sourceNote: "resend_webhook" },
  });

  const contact = await prisma.marketingContact.findUnique({ where: { emailNormalized } });
  if (contact) {
    await prisma.marketingContact.update({
      where: { id: contact.id },
      data: {
        status: reason === "COMPLAINT" ? "COMPLAINED" : "BOUNCED",
        suppressedAt: new Date(),
        suppressionReason: reason,
      },
    });
  }

  await prisma.growthLead.updateMany({
    where: { contactEmailNormalized: emailNormalized },
    data: { status: reason === "COMPLAINT" ? "UNSUBSCRIBED" : "BOUNCED" },
  });
}

export async function processVerifiedResendWebhook(
  prisma: PrismaClient,
  event: ResendWebhookBody,
  externalId: string,
): Promise<{ ok: true; handled: string } | { ok: false; error: string }> {
  const existing = await prisma.marketingProviderWebhookEvent.findFirst({
    where: { provider: "resend", externalId },
    select: { id: true, processedAt: true },
  });
  if (existing?.processedAt) return { ok: true, handled: "duplicate" };

  const row =
    existing ??
    (await recordMarketingProviderWebhook(prisma, {
      provider: "resend",
      eventType: event.type ?? "unknown",
      externalId,
      payload: event as Prisma.InputJsonValue,
    }));

  const providerMessageId = event.data?.email_id?.trim();
  const toEmail = normalizeMarketingEmail(extractAddress(event.data?.to ?? ""));
  const send = providerMessageId
    ? await prisma.marketingEmailSend.findFirst({
        where: { providerMessageId },
        select: { id: true, contactId: true, toEmailNormalized: true, category: true },
      })
    : toEmail
      ? await prisma.marketingEmailSend.findFirst({
          where: { toEmailNormalized: toEmail, category: { in: ["OUTREACH", "MARKETING"] } },
          orderBy: { sentAt: "desc" },
          select: { id: true, contactId: true, toEmailNormalized: true, category: true },
        })
      : null;

  const now = new Date();
  const type = event.type ?? "";

  if (type === "email.delivered" && send) {
    await prisma.marketingEmailSend.update({
      where: { id: send.id },
      data: { deliveredAt: now },
    });
    await prisma.marketingEvent.create({
      data: {
        type: "EMAIL_DELIVERED",
        contactId: send.contactId ?? undefined,
        payload: { sendId: send.id, providerMessageId } as Prisma.InputJsonValue,
      },
    });
  } else if (type === "email.bounced") {
    const targetEmail = toEmail || send?.toEmailNormalized;
    const bounceInfo = event.data?.bounce;
    const hard = isResendHardBounce(bounceInfo);
    if (send) {
      if (hard) {
        await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: {
            bouncedAt: now,
            lastError: bounceInfo?.message
              ? `hard_bounce: ${String(bounceInfo.message).slice(0, 400)}`
              : "hard_bounce",
          },
        });
        await prisma.marketingEvent.create({
          data: {
            type: "EMAIL_BOUNCED",
            contactId: send.contactId ?? undefined,
            payload: {
              sendId: send.id,
              providerMessageId,
              bounceType: bounceInfo?.type ?? null,
              hard: true,
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        // Soft/transient: do not set bouncedAt (health throttle) and do not permanently suppress.
        await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: {
            lastError: bounceInfo?.message
              ? `soft_bounce: ${String(bounceInfo.message).slice(0, 400)}`
              : `soft_bounce:${bounceInfo?.type ?? "transient"}`,
          },
        });
        await prisma.marketingEvent.create({
          data: {
            type: "EMAIL_BOUNCED",
            contactId: send.contactId ?? undefined,
            payload: {
              sendId: send.id,
              providerMessageId,
              bounceType: bounceInfo?.type ?? null,
              hard: false,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (hard && targetEmail) await suppressMarketingContact(prisma, targetEmail, "HARD_BOUNCE");
  } else if (type === "email.complained") {
    const targetEmail = toEmail || send?.toEmailNormalized;
    if (send) {
      await prisma.marketingEmailSend.update({
        where: { id: send.id },
        data: { complainedAt: now },
      });
      await prisma.marketingEvent.create({
        data: {
          type: "EMAIL_COMPLAINED",
          contactId: send.contactId ?? undefined,
          payload: { sendId: send.id, providerMessageId } as Prisma.InputJsonValue,
        },
      });
    }
    if (targetEmail) await suppressMarketingContact(prisma, targetEmail, "COMPLAINT");
  } else if (type === "email.received" || type === "email.replied") {
    const fromEmail = extractAddress(event.data?.from);
    const inboundText = [event.data?.subject ?? "", event.data?.text ?? "", event.data?.html ?? ""]
      .filter(Boolean)
      .join("\n");
    await ingestInboundCorrectionReply(prisma, {
      fromEmail,
      subject: event.data?.subject ?? null,
      text: inboundText,
      providerMessageId: providerMessageId ?? null,
      source: "resend_inbound",
    });
  }

  await prisma.marketingProviderWebhookEvent.update({
    where: { id: row.id },
    data: { processedAt: now },
  });

  return { ok: true, handled: type || "unknown" };
}

export async function handleResendWebhookRequest(
  prisma: PrismaClient,
  rawBody: string,
  headers: { svixId?: string | null; svixTimestamp?: string | null; svixSignature?: string | null },
): Promise<{ status: number; body: string }> {
  const event = verifyResendWebhookPayload(rawBody, headers);
  if (!event) return { status: 401, body: "invalid_webhook" };
  const externalId = headers.svixId?.trim();
  if (!externalId) return { status: 400, body: "missing_svix_id" };
  const result = await processVerifiedResendWebhook(prisma, event, externalId);
  if (!result.ok) return { status: 500, body: result.error };
  return { status: 200, body: "ok" };
}
