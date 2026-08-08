import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { buildOwnerDailySummary } from "@/lib/ownerSummary/buildOwnerDailySummary";
import {
  ownerDailySummarySubject,
  renderOwnerDailySummaryHtml,
  renderOwnerDailySummaryText,
} from "@/lib/ownerSummary/ownerDailySummaryEmail";
import { deliverResendEmail } from "@/lib/mailer";
import { ownerSummaryRecipient } from "@/lib/ownerSummary/ownerSummaryConfig";

const PAYLOAD_KIND = "daily_owner_summary";

async function alreadySentForChicagoDate(prisma: PrismaClient, chicagoDate: string): Promise<boolean> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const rows = await prisma.marketingEvent.findMany({
    where: { type: "INTERNAL_AUDIT", createdAt: { gte: since } },
    select: { payload: true },
    take: 500,
  });
  for (const r of rows) {
    const p = r.payload as { kind?: string; chicagoDate?: string } | null;
    if (p?.kind === PAYLOAD_KIND && p?.chicagoDate === chicagoDate) return true;
  }
  return false;
}

export type SendOwnerDailySummaryResult =
  | { ok: true; skipped: true; reason: string; chicagoDate: string }
  | { ok: true; skipped: false; messageId?: string; devSkipped?: boolean; chicagoDate: string; recipient: string }
  | { ok: false; error: string; chicagoDate: string };

/**
 * Build and email the owner daily summary. Uses Resend (`deliverResendEmail`, transactional).
 * @param opts.force — send even if already sent for this Chicago calendar date (manual trigger).
 * @param opts.dryRun — build only, no email (preview).
 */
export async function sendOwnerDailySummary(
  prisma: PrismaClient,
  opts?: { now?: Date; force?: boolean; dryRun?: boolean },
): Promise<SendOwnerDailySummaryResult> {
  const now = opts?.now ?? new Date();
  const data = await buildOwnerDailySummary(prisma, now);
  const chicagoDate = data.reportChicagoDate;
  const recipient = ownerSummaryRecipient();

  if (opts?.dryRun) {
    return { ok: true, skipped: true, reason: "dry_run", chicagoDate };
  }

  if (!opts?.force && (await alreadySentForChicagoDate(prisma, chicagoDate))) {
    console.info("[owner summary] skip: already sent for Chicago date", { chicagoDate, recipient });
    return { ok: true, skipped: true, reason: "already_sent_for_date", chicagoDate };
  }

  const subject = ownerDailySummarySubject(data);
  const html = renderOwnerDailySummaryHtml(data);
  const text = renderOwnerDailySummaryText(data);

  try {
    const out = await deliverResendEmail({
      to: recipient,
      subject,
      html,
      text,
      category: "transactional",
      allowDevSkipWhenNoApiKey: true,
    });

    if (out.skipped) {
      console.warn("[owner summary] Resend skipped (no API key in dev)", { recipient, chicagoDate });
      return { ok: true, skipped: false, devSkipped: true, chicagoDate, recipient };
    }

    const payload: Prisma.InputJsonValue = {
      kind: PAYLOAD_KIND,
      chicagoDate,
      recipient,
      messageId: out.messageId ?? null,
    };

    await prisma.marketingEvent.create({
      data: {
        type: "INTERNAL_AUDIT",
        actorEmail: "system:daily-owner-summary",
        payload,
      },
    });

    console.info("[owner summary] sent", { recipient, chicagoDate, messageId: out.messageId });
    return { ok: true, skipped: false, messageId: out.messageId, chicagoDate, recipient };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[owner summary] send failed", { recipient, chicagoDate, error });
    return { ok: false, error, chicagoDate };
  }
}
