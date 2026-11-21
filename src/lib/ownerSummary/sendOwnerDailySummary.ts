import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { buildOwnerDailySummary } from "@/lib/ownerSummary/buildOwnerDailySummary";
import { chicagoOwnerSummaryWeekKey } from "@/lib/ownerSummary/chicagoWindow";
import {
  ownerDailySummarySubject,
  renderOwnerDailySummaryHtml,
  renderOwnerDailySummaryText,
} from "@/lib/ownerSummary/ownerDailySummaryEmail";
import { deliverResendEmail } from "@/lib/mailer";
import { ownerSummaryRecipient } from "@/lib/ownerSummary/ownerSummaryConfig";

/** Legacy per-day kind (kept so old rows still count toward the week). */
const PAYLOAD_KIND_LEGACY_DAILY = "daily_owner_summary";
/** Current per-week kind. */
const PAYLOAD_KIND_WEEKLY = "weekly_owner_summary";

async function alreadySentForChicagoWeek(prisma: PrismaClient, chicagoWeek: string): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await prisma.marketingEvent.findMany({
    where: { type: "INTERNAL_AUDIT", createdAt: { gte: since } },
    select: { payload: true },
    take: 800,
  });
  for (const r of rows) {
    const p = r.payload as { kind?: string; chicagoWeek?: string; chicagoDate?: string } | null;
    if (!p?.kind) continue;
    if (p.kind === PAYLOAD_KIND_WEEKLY && p.chicagoWeek === chicagoWeek) return true;
    // Legacy daily rows: treat any send whose Chicago date falls in this ISO week as already sent.
    if (p.kind === PAYLOAD_KIND_LEGACY_DAILY && p.chicagoDate) {
      const legacyWeek = chicagoOwnerSummaryWeekKey(new Date(`${p.chicagoDate}T18:00:00-06:00`));
      if (legacyWeek === chicagoWeek) return true;
    }
  }
  return false;
}

export type SendOwnerDailySummaryResult =
  | { ok: true; skipped: true; reason: string; chicagoDate: string; chicagoWeek: string }
  | {
      ok: true;
      skipped: false;
      messageId?: string;
      devSkipped?: boolean;
      chicagoDate: string;
      chicagoWeek: string;
      recipient: string;
    }
  | { ok: false; error: string; chicagoDate: string; chicagoWeek: string };

/**
 * Build and email the owner weekly summary (Friday CT gate in cron). Uses Resend (`deliverResendEmail`, transactional).
 * @param opts.force — send even if already sent for this Chicago ISO week (manual trigger).
 * @param opts.dryRun — build only, no email (preview).
 */
export async function sendOwnerDailySummary(
  prisma: PrismaClient,
  opts?: { now?: Date; force?: boolean; dryRun?: boolean },
): Promise<SendOwnerDailySummaryResult> {
  const now = opts?.now ?? new Date();
  const data = await buildOwnerDailySummary(prisma, now);
  const chicagoDate = data.reportChicagoDate;
  const chicagoWeek = chicagoOwnerSummaryWeekKey(now);
  const recipient = ownerSummaryRecipient();

  if (opts?.dryRun) {
    return { ok: true, skipped: true, reason: "dry_run", chicagoDate, chicagoWeek };
  }

  if (!opts?.force && (await alreadySentForChicagoWeek(prisma, chicagoWeek))) {
    console.info("[owner summary] skip: already sent for Chicago week", { chicagoWeek, chicagoDate, recipient });
    return { ok: true, skipped: true, reason: "already_sent_for_week", chicagoDate, chicagoWeek };
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
      console.warn("[owner summary] Resend skipped (no API key in dev)", { recipient, chicagoDate, chicagoWeek });
      return { ok: true, skipped: false, devSkipped: true, chicagoDate, chicagoWeek, recipient };
    }

    const payload: Prisma.InputJsonValue = {
      kind: PAYLOAD_KIND_WEEKLY,
      chicagoDate,
      chicagoWeek,
      recipient,
      messageId: out.messageId ?? null,
    };

    await prisma.marketingEvent.create({
      data: {
        type: "INTERNAL_AUDIT",
        actorEmail: "system:weekly-owner-summary",
        payload,
      },
    });

    console.info("[owner summary] sent", { recipient, chicagoDate, chicagoWeek, messageId: out.messageId });
    return { ok: true, skipped: false, messageId: out.messageId, chicagoDate, chicagoWeek, recipient };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[owner summary] send failed", { recipient, chicagoDate, chicagoWeek, error });
    return { ok: false, error, chicagoDate, chicagoWeek };
  }
}
