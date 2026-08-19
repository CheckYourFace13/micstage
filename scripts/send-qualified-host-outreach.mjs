/**
 * Send first qualified Host outreach under normal automation gates.
 * Run: npx tsx scripts/send-qualified-host-outreach.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { explainGrowthLeadOutreachEligibility } from "../src/lib/growth/outreachContactEligible.ts";
import { createPendingGrowthLeadOutreachDraft } from "../src/lib/growth/growthLeadOutreachDraftCreate.ts";
import { sendApprovedGrowthLeadDraft } from "../src/lib/growth/growthLeadDraftSend.ts";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const candidates = await prisma.growthLead.findMany({
  where: {
    leadType: "PROMOTER_ACCOUNT",
    contactEmailConfidence: "HIGH",
    contactEmailNormalized: { not: null },
    status: { notIn: ["JOINED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
  },
  orderBy: [{ updatedAt: "asc" }],
  take: 10,
});

let sent = null;
for (const lead of candidates) {
  const eligibility = await explainGrowthLeadOutreachEligibility(prisma, lead.id);
  if (!eligibility.eligible) continue;

  const existingDraft = await prisma.growthLeadOutreachDraft.findFirst({
    where: { leadId: lead.id, status: { in: ["PENDING_REVIEW", "APPROVED", "SENT"] } },
    orderBy: { createdAt: "desc" },
  });

  let draftId = existingDraft?.id;
  if (!draftId) {
    const created = await createPendingGrowthLeadOutreachDraft(prisma, lead.id);
    if (!created.ok) continue;
    draftId = created.draftId;
    await prisma.growthLeadOutreachDraft.update({
      where: { id: draftId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByEmail: "send-qualified-host-outreach" },
    });
  } else if (existingDraft.status === "SENT") {
    continue;
  } else if (existingDraft.status === "PENDING_REVIEW") {
    await prisma.growthLeadOutreachDraft.update({
      where: { id: existingDraft.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByEmail: "send-qualified-host-outreach" },
    });
    draftId = existingDraft.id;
  }

  const result = await sendApprovedGrowthLeadDraft(prisma, draftId);
  sent = { leadId: lead.id, leadName: lead.name, draftId, result };
  break;
}

console.log(JSON.stringify({ ok: Boolean(sent?.result?.ok), sent }, null, 2));
await pool.end();
process.exit(sent?.result?.ok ? 0 : 1);
