/**
 * One-shot: retry growth-lead outreach sends that failed after Resend/domain issues were fixed.
 * Picks APPROVED drafts with lastError set (send was attempted and failed).
 */
import { requirePrisma } from "../src/lib/prisma";
import { sendApprovedGrowthLeadDraft } from "../src/lib/growth/growthLeadDraftSend";

async function main() {
  const prisma = requirePrisma();
  const drafts = await prisma.growthLeadOutreachDraft.findMany({
    where: { status: "APPROVED", lastError: { not: null } },
    select: { id: true, toEmailNormalized: true },
    orderBy: { updatedAt: "asc" },
  });
  for (const d of drafts) {
    const r = await sendApprovedGrowthLeadDraft(prisma, d.id, { allowLowConfidenceEmail: true });
    console.log(d.id, d.toEmailNormalized, r.ok ? "OK" : r.reasons.join(" | "));
  }
  console.log(`Done. Processed ${drafts.length} draft(s).`);
}

void main();
