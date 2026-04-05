import type { PrismaClient } from "@/generated/prisma/client";
import { growthAutoDraftBatchLimit, growthAutoDraftFitMin } from "@/lib/growth/expansionConfig";
import { createPendingGrowthLeadOutreachDraft } from "@/lib/growth/growthLeadOutreachDraftCreate";

/**
 * Auto-creates PENDING_REVIEW drafts for approved (or high-fit reviewed) leads with email.
 * Does not send. Safe for queued markets (drafts are allowed; sends are gated separately).
 */
export async function runAutoGrowthOutreachDrafts(prisma: PrismaClient): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const fitMin = growthAutoDraftFitMin();
  const limit = growthAutoDraftBatchLimit();

  const candidates = await prisma.growthLead.findMany({
    where: {
      contactEmailNormalized: { not: null },
      OR: [{ status: "APPROVED" }, { status: "REVIEWED", fitScore: { gte: fitMin } }],
      outreachDrafts: { none: { status: { in: ["PENDING_REVIEW", "APPROVED", "SENT"] } } },
    },
    select: { id: true },
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    const r = await createPendingGrowthLeadOutreachDraft(prisma, c.id);
    if (r.ok) {
      created++;
    } else {
      skipped++;
      if (!r.reason.includes("already has")) {
        errors.push(`${c.id}: ${r.reason}`);
      }
    }
  }

  return { created, skipped, errors };
}
