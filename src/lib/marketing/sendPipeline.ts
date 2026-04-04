import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { MarketingEmailCategory } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { explainMarketingSendBlock } from "@/lib/marketing/blockReasons";
import { marketingUnsubscribeMailto, prismaCategoryFromMicStage, type MicStageEmailCategory } from "@/lib/marketing/emailConfig";
import { appendCommercialEmailFooter, buildListUnsubscribeHeaders } from "@/lib/marketing/emailFooter";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { checkCategoryAndDomainCaps, checkContactSendSpacing } from "@/lib/marketing/sendCaps";
import { marketingUnsubscribeHttpsUrl } from "@/lib/marketing/unsubscribeSigning";

export function buildMarketingIdempotencyKey(
  category: MicStageEmailCategory,
  templateKind: string,
  email: string,
  purposeKey: string,
): string {
  const norm = normalizeMarketingEmail(email);
  return createHash("sha256")
    .update(`${category}|${templateKind}|${norm}|${purposeKey}`, "utf8")
    .digest("hex");
}

function toDomainFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "invalid";
  return email.slice(at + 1).toLowerCase();
}

async function upsertContactForSend(
  prisma: PrismaClient,
  email: string,
  venueId?: string | null,
  discoveryMarketSlug?: string | null,
) {
  const emailNormalized = normalizeMarketingEmail(email);
  return prisma.marketingContact.upsert({
    where: { emailNormalized },
    create: {
      emailNormalized,
      venueId: venueId ?? undefined,
      discoveryMarketSlug: discoveryMarketSlug ?? undefined,
      source: "send-pipeline",
      status: "ACTIVE",
    },
    update: {
      venueId: venueId ?? undefined,
      discoveryMarketSlug: discoveryMarketSlug ?? undefined,
    },
  });
}

export type MarketingSendResult =
  | { ok: true; duplicate?: boolean; sendId: string; providerMessageId?: string | null }
  | { ok: false; sendId?: string; blocked: true; reasons: string[] };

/**
 * Idempotent marketing/outreach/transactional send with caps, suppression, audit row, and Resend delivery.
 */
export async function sendThroughMarketingPipeline(
  prisma: PrismaClient,
  input: {
    to: string;
    category: MicStageEmailCategory;
    templateKind: string;
    purposeKey: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    venueId?: string | null;
    discoveryMarketSlug?: string | null;
    /** When false, skip commercial footer + list-unsubscribe (not recommended). */
    includeCommercialCompliance?: boolean;
  },
): Promise<MarketingSendResult> {
  const email = normalizeMarketingEmail(input.to);
  if (!email) {
    return { ok: false, blocked: true, reasons: ["Invalid recipient email"] };
  }

  const categoryPrisma = prismaCategoryFromMicStage(input.category);
  const idempotencyKey = buildMarketingIdempotencyKey(input.category, input.templateKind, email, input.purposeKey);
  const toDomain = toDomainFromEmail(email);
  const includeCompliance =
    input.includeCommercialCompliance !== false && (input.category === "outreach" || input.category === "marketing");

  const existing = await prisma.marketingEmailSend.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "SENT") {
    return {
      ok: true,
      duplicate: true,
      sendId: existing.id,
      providerMessageId: existing.providerMessageId,
    };
  }
  if (existing?.status === "BLOCKED") {
    return {
      ok: false,
      blocked: true,
      reasons: [existing.blockedReason ?? "Previously blocked (idempotent)"],
      sendId: existing.id,
    };
  }

  const contact = await upsertContactForSend(prisma, email, input.venueId, input.discoveryMarketSlug);
  const block = await explainMarketingSendBlock(prisma, {
    to: email,
    category: input.category,
    contact,
  });

  const capCat = await checkCategoryAndDomainCaps(prisma, categoryPrisma, toDomain);
  const capContact = await checkContactSendSpacing(prisma, contact.id, categoryPrisma);

  const reasons: string[] = [];
  if (block.blocked) reasons.push(...block.reasons);
  if (!capCat.ok) reasons.push(capCat.reason);
  if (!capContact.ok) reasons.push(capContact.reason);

  const sendRowBase = {
    toEmailNormalized: email,
    toDomain,
    category: categoryPrisma,
    templateKind: input.templateKind,
    purposeKey: input.purposeKey,
    idempotencyKey,
    subject: input.subject,
    discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
  };

  function queuedRowData(): Prisma.MarketingEmailSendCreateInput {
    const d: Prisma.MarketingEmailSendCreateInput = {
      ...sendRowBase,
      contact: { connect: { id: contact.id } },
      status: "QUEUED",
    };
    if (input.venueId) d.venue = { connect: { id: input.venueId } };
    return d;
  }

  let sendId: string;

  if (reasons.length > 0) {
    const row =
      existing ??
      (await prisma.marketingEmailSend.create({
        data: {
          ...queuedRowData(),
          status: "BLOCKED",
          blockedReason: reasons.join(" | ").slice(0, 4000),
        },
      }));
    if (!existing) {
      await prisma.marketingEvent.create({
        data: {
          type: "EMAIL_BLOCKED",
          contactId: contact.id,
          venueId: input.venueId ?? undefined,
          discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
          payload: { reasons, templateKind: input.templateKind } as Prisma.InputJsonValue,
        },
      });
    }
    return { ok: false, blocked: true, reasons, sendId: row.id };
  }

  let html = input.htmlBody;
  let text = input.textBody;
  let headers: Record<string, string> | undefined;

  if (includeCompliance) {
    const unsubUrl = marketingUnsubscribeHttpsUrl(contact.id);
    const footered = appendCommercialEmailFooter({ html, text, unsubscribeUrl: unsubUrl });
    html = footered.html;
    text = footered.text;
    const mailto = marketingUnsubscribeMailto();
    headers = buildListUnsubscribeHeaders(unsubUrl, mailto);
  }

  const row = existing ?? (await prisma.marketingEmailSend.create({ data: queuedRowData() }));
  sendId = row.id;

  try {
    const { messageId, skipped } = await deliverResendEmail({
      to: email,
      subject: input.subject,
      html,
      text,
      category: input.category,
      headers,
      allowDevSkipWhenNoApiKey: input.category === "transactional",
    });

    if (skipped) {
      await prisma.marketingEmailSend.update({
        where: { id: sendId },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          lastError: "RESEND skipped (no API key in dev)",
        },
      });
      return { ok: false, blocked: true, reasons: ["Resend skipped — no API key (dev)"], sendId };
    }

    await prisma.marketingEmailSend.update({
      where: { id: sendId },
      data: {
        status: "SENT",
        providerMessageId: messageId ?? null,
        sentAt: new Date(),
        blockedReason: null,
        failedAt: null,
        lastError: null,
      },
    });

    await prisma.marketingEvent.create({
      data: {
        type: "EMAIL_SENT",
        contactId: contact.id,
        venueId: input.venueId ?? undefined,
        discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
        payload: {
          templateKind: input.templateKind,
          category: input.category,
          providerMessageId: messageId,
        } as Prisma.InputJsonValue,
      },
    });

    return { ok: true, sendId, providerMessageId: messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[marketing sendPipeline] deliver failed", { sendId, msg, toDomain });
    await prisma.marketingEmailSend.update({
      where: { id: sendId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        lastError: msg.slice(0, 4000),
      },
    });
    await prisma.marketingEvent.create({
      data: {
        type: "EMAIL_FAILED",
        contactId: contact.id,
        venueId: input.venueId ?? undefined,
        payload: { templateKind: input.templateKind, error: msg.slice(0, 500) } as Prisma.InputJsonValue,
      },
    });
    return { ok: false, blocked: true, reasons: [msg], sendId };
  }
}

