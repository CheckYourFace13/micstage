import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { sendPasswordResetEmailForAdmin } from "@/lib/passwordReset";

/** Production SHA 6984176 — password-reset origin + multi-role lookup. */
export const SUPPORT_CLOSEOUT_FIX_AT = new Date("2026-10-29T02:49:16.000Z");

export const UNITY_LISTING_SLUG = "unity-of-las-vegas-coffee-house-open-mic-night";
export const IAN_SUPPORT_SUBJECT = "MicStage support: your password reset";
export const UNITY_ACK_SUBJECT = "MicStage: listing removal confirmed";

export function redactEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return "(none)";
  return `${e.slice(0, 2)}…${e.slice(at)}`;
}

export function ianSupportEmailContent(): { subject: string; text: string; html: string } {
  return {
    subject: IAN_SUPPORT_SUBJECT,
    text: [
      "Hi Ian,",
      "",
      "Thanks for writing. We fixed the password-reset issue that could lock someone out when an email matches more than one MicStage role.",
      "",
      "A fresh secure reset link is in a separate email. It expires in two hours. After you set a new password, you can sign in right away.",
      "",
      "If that email does not arrive, check spam or reply to this message.",
      "",
      "Thanks,",
      "MicStage",
    ].join("\n"),
    html: [
      "<p>Hi Ian,</p>",
      "<p>Thanks for writing. We fixed the password-reset issue that could lock someone out when an email matches more than one MicStage role.</p>",
      "<p>A fresh secure reset link is in a separate email. It expires in two hours. After you set a new password, you can sign in right away.</p>",
      "<p>If that email does not arrive, check spam or reply to this message.</p>",
      "<p>Thanks,<br />MicStage</p>",
    ].join(""),
  };
}

export function unityAckEmailContent(): { subject: string; text: string; html: string } {
  return {
    subject: UNITY_ACK_SUBJECT,
    text: [
      "Hi,",
      "",
      "We've processed your request. The Unity of Las Vegas Coffee House Open Mic listing has been removed from MicStage.",
      "We will not contact you about marketing or listing that room again.",
      "",
      "Thanks,",
      "MicStage",
    ].join("\n"),
    html: [
      "<p>Hi,</p>",
      "<p>We've processed your request. The Unity of Las Vegas Coffee House Open Mic listing has been removed from MicStage.</p>",
      "<p>We will not contact you about marketing or listing that room again.</p>",
      "<p>Thanks,<br />MicStage</p>",
    ].join(""),
  };
}

function domainOf(email: string): string {
  return email.split("@")[1] || "unknown";
}

async function alreadySent(prisma: PrismaClient, idempotencyKey: string): Promise<boolean> {
  const row = await prisma.marketingEmailSend.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  return Boolean(row);
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

export type SupportCloseoutAction = {
  kind: "ian_reset" | "ian_support" | "unity_ack";
  email: string;
  status: "sent" | "skipped";
  reason?: string;
  messageId?: string;
};

export async function closeCustomerSupportLoops(prisma: PrismaClient): Promise<{
  actions: SupportCloseoutAction[];
  ianEmails: string[];
  unityEmail: string | null;
}> {
  const actions: SupportCloseoutAction[] = [];
  const ianEmails = await ianAccountEmails(prisma);

  for (const email of ianEmails) {
    const resetKey = `support-closeout:ian-reset:${email}`;
    const postFixReset = await prisma.passwordResetToken.findFirst({
      where: { email, createdAt: { gte: SUPPORT_CLOSEOUT_FIX_AT } },
      select: { id: true },
    });
    if (postFixReset || (await alreadySent(prisma, resetKey))) {
      actions.push({ kind: "ian_reset", email: redactEmail(email), status: "skipped", reason: "already_issued" });
    } else {
      const reset = await sendPasswordResetEmailForAdmin({ email });
      if (!reset.ok) {
        actions.push({ kind: "ian_reset", email: redactEmail(email), status: "skipped", reason: reset.error });
      } else {
        await recordTransactionalSend(prisma, {
          to: email,
          purposeKey: resetKey,
          templateKind: "support_closeout_ian_reset",
          subject: "MicStage password reset",
        });
        actions.push({ kind: "ian_reset", email: redactEmail(email), status: "sent" });
      }
    }

    const supportKey = `support-closeout:ian-reply:${email}`;
    if (await alreadySent(prisma, supportKey)) {
      actions.push({ kind: "ian_support", email: redactEmail(email), status: "skipped", reason: "already_sent" });
    } else {
      const content = ianSupportEmailContent();
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
        templateKind: "support_closeout_ian_reply",
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

  const unityListing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: UNITY_LISTING_SLUG },
    select: {
      id: true,
      claimInviteEmail: true,
      growthLead: { select: { contactEmailNormalized: true } },
    },
  });
  const unityEmail =
    unityListing?.growthLead?.contactEmailNormalized ||
    (unityListing?.claimInviteEmail ? normalizeMarketingEmail(unityListing.claimInviteEmail) : null);

  if (!unityEmail) {
    actions.push({ kind: "unity_ack", email: "(none)", status: "skipped", reason: "no_contact" });
    return { actions, ianEmails: ianEmails.map(redactEmail), unityEmail: null };
  }

  const unityKey = `support-closeout:unity-ack:${unityEmail}`;
  if (await alreadySent(prisma, unityKey)) {
    actions.push({ kind: "unity_ack", email: redactEmail(unityEmail), status: "skipped", reason: "already_sent" });
  } else {
    const content = unityAckEmailContent();
    const sent = await deliverResendEmail({
      to: unityEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      category: "transactional",
      allowDevSkipWhenNoApiKey: false,
    });
    await recordTransactionalSend(prisma, {
      to: unityEmail,
      purposeKey: unityKey,
      templateKind: "support_closeout_unity_ack",
      subject: content.subject,
      providerMessageId: sent.messageId,
    });
    actions.push({
      kind: "unity_ack",
      email: redactEmail(unityEmail),
      status: "sent",
      messageId: sent.messageId,
    });
  }

  await prisma.marketingEvent.create({
    data: {
      type: "INTERNAL_AUDIT",
      payload: {
        kind: "support_loop_closeout",
        actions,
      },
    },
  });

  return { actions, ianEmails: ianEmails.map(redactEmail), unityEmail: redactEmail(unityEmail) };
}
