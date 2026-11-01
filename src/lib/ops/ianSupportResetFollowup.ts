import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { sendPasswordResetEmailForAdmin } from "@/lib/passwordReset";
import { redactEmail } from "@/lib/ops/closeCustomerSupportLoops";

export const IAN_RESET_FOLLOWUP_SUBJECT = "MicStage support: your password reset";
export const IAN_RESET_FOLLOWUP_PURPOSE = "support-reset-24h:2026-11-01";

export function ianResetFollowupEmailContent(): { subject: string; text: string; html: string } {
  return {
    subject: IAN_RESET_FOLLOWUP_SUBJECT,
    text: [
      "Hi Ian,",
      "",
      "No problem. We sent you a new password-reset link with a 24-hour window.",
      "",
      "If you have any trouble with it, just reply here and we’ll help.",
      "",
      "Thanks,",
      "MicStage",
    ].join("\n"),
    html: [
      "<p>Hi Ian,</p>",
      "<p>No problem. We sent you a new password-reset link with a 24-hour window.</p>",
      "<p>If you have any trouble with it, just reply here and we’ll help.</p>",
      "<p>Thanks,<br />MicStage</p>",
    ].join(""),
  };
}

function domainOf(email: string): string {
  return email.split("@")[1] || "unknown";
}

async function ianAccountEmails(prisma: PrismaClient): Promise<string[]> {
  const host = await prisma.promoterUser.findFirst({
    where: { displayName: { equals: "Ian Eric", mode: "insensitive" } },
    select: { email: true },
  });
  if (!host?.email) return [];
  const domain = domainOf(host.email.toLowerCase());
  const [owners, managers, promoters, musicians] = await Promise.all([
    prisma.venueOwner.findMany({
      where: { email: { endsWith: `@${domain}` } },
      select: { email: true },
    }),
    prisma.venueManager.findMany({
      where: { email: { endsWith: `@${domain}` } },
      select: { email: true },
    }),
    prisma.promoterUser.findMany({
      where: { email: { endsWith: `@${domain}` } },
      select: { email: true },
    }),
    prisma.musicianUser.findMany({
      where: { email: { endsWith: `@${domain}` } },
      select: { email: true },
    }),
  ]);
  return [
    ...new Set(
      [...owners, ...managers, ...promoters, ...musicians].map((r) => r.email.trim().toLowerCase()),
    ),
  ];
}

async function recordTransactionalSend(
  prisma: PrismaClient,
  input: {
    to: string;
    purposeKey: string;
    templateKind: string;
    subject: string;
    providerMessageId?: string;
  },
) {
  const email = normalizeMarketingEmail(input.to);
  await prisma.marketingEmailSend.create({
    data: {
      toEmailNormalized: email,
      toDomain: domainOf(email),
      category: "TRANSACTIONAL",
      templateKind: input.templateKind,
      purposeKey: input.purposeKey,
      idempotencyKey: input.purposeKey,
      subject: input.subject,
      status: "SENT",
      sentAt: new Date(),
      providerMessageId: input.providerMessageId,
    },
  });
}

export type IanResetFollowupAction = {
  kind: "ian_reset" | "ian_support";
  email: string;
  status: "sent" | "skipped";
  reason?: string;
  messageId?: string;
};

export async function sendIanSupportResetFollowup(prisma: PrismaClient): Promise<{
  actions: IanResetFollowupAction[];
  ianEmails: string[];
}> {
  const actions: IanResetFollowupAction[] = [];
  const ianEmails = await ianAccountEmails(prisma);

  for (const email of ianEmails) {
    const resetKey = `${IAN_RESET_FOLLOWUP_PURPOSE}:reset:${email}`;
    const existingReset = await prisma.marketingEmailSend.findUnique({
      where: { idempotencyKey: resetKey },
      select: { id: true },
    });
    if (existingReset) {
      actions.push({ kind: "ian_reset", email: redactEmail(email), status: "skipped", reason: "already_sent" });
    } else {
      const reset = await sendPasswordResetEmailForAdmin({ email });
      if (!reset.ok) {
        actions.push({ kind: "ian_reset", email: redactEmail(email), status: "skipped", reason: reset.error });
      } else {
        await recordTransactionalSend(prisma, {
          to: email,
          purposeKey: resetKey,
          templateKind: "support_reset_24h_ian",
          subject: "MicStage password reset",
        });
        actions.push({ kind: "ian_reset", email: redactEmail(email), status: "sent" });
      }
    }

    const supportKey = `${IAN_RESET_FOLLOWUP_PURPOSE}:reply:${email}`;
    const existingReply = await prisma.marketingEmailSend.findUnique({
      where: { idempotencyKey: supportKey },
      select: { id: true },
    });
    if (existingReply) {
      actions.push({ kind: "ian_support", email: redactEmail(email), status: "skipped", reason: "already_sent" });
    } else {
      const content = ianResetFollowupEmailContent();
      const sent = await deliverResendEmail({
        to: email,
        subject: content.subject,
        text: content.text,
        html: content.html,
        category: "transactional",
        allowDevSkipWhenNoApiKey: false,
      });
      await recordTransactionalSend(prisma, {
        to: email,
        purposeKey: supportKey,
        templateKind: "support_reset_24h_ian_reply",
        subject: content.subject,
        providerMessageId: sent.messageId,
      });
      actions.push({
        kind: "ian_support",
        email: redactEmail(email),
        status: "sent",
        messageId: sent.messageId,
      });
    }
  }

  await prisma.marketingEvent.create({
    data: {
      type: "INTERNAL_AUDIT",
      payload: {
        kind: "ian_support_reset_24h",
        actions,
      },
    },
  });

  return { actions, ianEmails: ianEmails.map(redactEmail) };
}
