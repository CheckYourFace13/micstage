/**
 * One-time: re-validate existing GrowthLead emails, null junk, set confidence / rejection / raw.
 * Run after migration: npx tsx scripts/backfill-growth-lead-emails.ts
 */
import { requirePrisma } from "../src/lib/prisma";
import { parseGrowthLeadEmailInput } from "../src/lib/growth/leadEmailValidation";

async function main() {
  const prisma = requirePrisma();
  const leads = await prisma.growthLead.findMany({
    where: {
      OR: [{ contactEmailNormalized: { not: null } }, { contactEmailRaw: { not: null } }],
    },
    select: {
      id: true,
      contactEmailNormalized: true,
      contactEmailRaw: true,
    },
  });

  let updatedOk = 0;
  let clearedInvalid = 0;

  for (const row of leads) {
    const rawForParse = (row.contactEmailRaw ?? row.contactEmailNormalized ?? "").trim();
    if (!rawForParse) continue;

    const p = parseGrowthLeadEmailInput(rawForParse, { extractedFromNoisyText: true });
    if (p.kind === "rejected") {
      await prisma.growthLead.update({
        where: { id: row.id },
        data: {
          contactEmailNormalized: null,
          contactEmailRaw: row.contactEmailRaw ?? row.contactEmailNormalized,
          contactEmailRejectionReason: p.rejectionReason,
          contactEmailConfidence: null,
        },
      });
      clearedInvalid++;
    } else if (p.kind === "valid") {
      await prisma.growthLead.update({
        where: { id: row.id },
        data: {
          contactEmailNormalized: p.normalized,
          contactEmailRaw: row.contactEmailRaw ?? row.contactEmailNormalized ?? p.rawExtracted,
          contactEmailConfidence: p.confidence,
          contactEmailRejectionReason: null,
        },
      });
      updatedOk++;
    }
  }

  console.log(JSON.stringify({ scanned: leads.length, updatedOk, clearedInvalid }, null, 2));
}

void main();
