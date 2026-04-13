"use server";

import { redirect } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import { getPrismaOrNull } from "@/lib/prisma";
import { sendOwnerDailySummary } from "@/lib/ownerSummary/sendOwnerDailySummary";

export async function sendOwnerDailySummaryNowAction() {
  await assertAdminSession();
  const prisma = getPrismaOrNull();
  if (!prisma) {
    redirect("/internal/admin/owner-summary?err=" + encodeURIComponent("Database not configured."));
  }
  const r = await sendOwnerDailySummary(prisma, { force: true });
  if (!r.ok) {
    redirect("/internal/admin/owner-summary?err=" + encodeURIComponent(r.error));
  }
  if (r.skipped) {
    redirect("/internal/admin/owner-summary?ok=" + encodeURIComponent(`Skipped: ${r.reason}`));
  }
  if (r.devSkipped) {
    redirect("/internal/admin/owner-summary?ok=" + encodeURIComponent("Dev: Resend skipped (no API key)."));
  }
  redirect(
    "/internal/admin/owner-summary?ok=" +
      encodeURIComponent(`Sent to ${r.recipient} (${r.messageId ?? "no id"})`),
  );
}
