/**
 * If recently sent outreach would now fail identity/evidence gates at a meaningful rate,
 * flip the DB kill switch so targeting errors cannot continue.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { explainGrowthLeadOutreachEligibility } from "@/lib/growth/outreachContactEligible";

const TARGETING_FAIL_REASONS = new Set([
  "directory_aggregator",
  "service_company",
  "chamber_tourism",
  "weak_identity",
  "needs_manual_review",
  "no_target_bound_open_mic_evidence",
  "festival_event_not_venue",
  "geography_conflict",
  "name_quality",
  "stale_open_mic_evidence",
  "artist_bio_false_positive",
  "microphone_equipment_false_positive",
]);

export type OutreachTargetingIntegrityResult = {
  ok: boolean;
  killed: boolean;
  reason: string | null;
  sampled: number;
  failed: number;
};

export async function evaluateOutreachTargetingIntegrity(
  prisma: PrismaClient,
): Promise<OutreachTargetingIntegrityResult> {
  const since = new Date(Date.now() - 7 * 86400000);
  const recent = await prisma.marketingEmailSend.findMany({
    where: {
      category: "OUTREACH",
      status: "SENT",
      sentAt: { gte: since },
      purposeKey: { startsWith: "growth-lead-draft:" },
    },
    select: { purposeKey: true, toEmailNormalized: true },
    orderBy: { sentAt: "desc" },
    take: 10,
  });

  let failed = 0;
  let sampled = 0;
  for (const send of recent) {
    const draftId = send.purposeKey.replace(/^growth-lead-draft:/, "");
    if (!draftId || draftId === send.purposeKey) continue;
    const draft = await prisma.growthLeadOutreachDraft.findUnique({
      where: { id: draftId },
      select: { leadId: true },
    });
    if (!draft) continue;
    sampled += 1;
    const elig = await explainGrowthLeadOutreachEligibility(prisma, draft.leadId, { ignoreDraftId: draftId });
    if (TARGETING_FAIL_REASONS.has(elig.reason)) failed += 1;
  }

  if (sampled < 5 || failed < 3) {
    return { ok: true, killed: false, reason: null, sampled, failed };
  }

  await prisma.operationalRuntimeSetting.upsert({
    where: { key: "GROWTH_OUTREACH_KILL" },
    create: {
      key: "GROWTH_OUTREACH_KILL",
      valueType: "boolean",
      value: "true",
      updatedBy: "outreach-targeting-integrity",
      reason: `auto_kill targeting_errors sampled=${sampled} failed=${failed}`,
    },
    update: {
      valueType: "boolean",
      value: "true",
      updatedBy: "outreach-targeting-integrity",
      reason: `auto_kill targeting_errors sampled=${sampled} failed=${failed}`,
    },
  });

  return {
    ok: false,
    killed: true,
    reason: `targeting integrity failed (${failed}/${sampled} recent sends would not pass identity/evidence)`,
    sampled,
    failed,
  };
}
