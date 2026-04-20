#!/usr/bin/env npx tsx
/**
 * One-time backfill: promote a parsable mailbox from linked MarketingContact rows
 * onto GrowthLead primary email fields for legacy CSV / Claude imports where
 * `contactEmailNormalized` was left null (e.g. primary column empty but
 * `additionalContactEmails` were persisted to the marketing sidecar only).
 *
 * Data model: `persistGrowthLeadEmailContacts` stores extras on `MarketingContact`
 * with `meta.growth.leadIds` containing the lead id (and `notes` like
 * `Growth lead contact (<id>)`). There is no `additionalContactEmails` column on
 * `GrowthLead` — this script uses that durable sidecar as the source of truth.
 *
 * Usage (from repo root, DATABASE_URL set or present in .env):
 *   npx tsx scripts/backfill-growth-lead-import-emails.ts           # dry-run
 *   npx tsx scripts/backfill-growth-lead-import-emails.ts --apply   # write
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import type { GrowthLeadEmailConfidence } from "../src/generated/prisma/client";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseGrowthLeadEmailInput } from "../src/lib/growth/leadEmailValidation";

function readDatabaseUrl(): string {
  const fromEnv = (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.PRISMA_DATABASE_URL ??
    ""
  ).trim();
  if (fromEnv) return fromEnv;
  if (!fs.existsSync(".env")) return "";
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/^DATABASE_URL\s*=\s*"?(.*?)"?\s*$/m);
  return (match?.[1] ?? "").trim();
}

function parseArgs(argv: string[]) {
  return { apply: argv.includes("--apply") };
}

async function loadLinkedContactEmails(prisma: PrismaClient, leadId: string): Promise<string[]> {
  const jsonArray = JSON.stringify([leadId]);
  const byMeta = await prisma.$queryRawUnsafe<Array<{ emailNormalized: string }>>(
    `SELECT "emailNormalized" FROM "MarketingContact"
     WHERE meta->'growth'->'leadIds' @> $1::jsonb
     ORDER BY "createdAt" ASC`,
    jsonArray,
  );
  const fromMeta = byMeta.map((r) => r.emailNormalized).filter(Boolean);

  const byNotes = await prisma.marketingContact.findMany({
    where: { notes: { contains: `Growth lead contact (${leadId})` } },
    select: { emailNormalized: true },
    orderBy: { createdAt: "asc" },
  });
  const fromNotes = byNotes.map((r) => r.emailNormalized).filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of [...fromMeta, ...fromNotes]) {
    const t = e.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(e);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = readDatabaseUrl();
  if (!url) {
    throw new Error("No DATABASE_URL found in env or .env");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  let scanned = 0;
  let withSidecarEmails = 0;
  let rowsUpdated = 0;
  let rowsWouldUpdate = 0;
  let skippedAlreadyHasPrimary = 0;
  let skippedNoEmails = 0;
  let skippedNoValidParse = 0;
  let skippedPrimaryConflict = 0;
  let skippedUpdateNoop = 0;

  try {
    const leads = await prisma.growthLead.findMany({
      where: {
        sourceKind: { in: ["CSV_IMPORT", "CLAUDE_CSV"] },
        contactEmailNormalized: null,
      },
      select: {
        id: true,
        name: true,
        leadType: true,
        contactQuality: true,
      },
      orderBy: { createdAt: "asc" },
    });

    scanned = leads.length;
    console.info(`[backfill] mode=${opts.apply ? "APPLY" : "DRY-RUN"} scanned_leads=${scanned}`);

    for (const lead of leads) {
      const fresh = await prisma.growthLead.findUnique({
        where: { id: lead.id },
        select: { contactEmailNormalized: true },
      });
      if (fresh?.contactEmailNormalized) {
        skippedAlreadyHasPrimary++;
        continue;
      }

      const rawCandidates = await loadLinkedContactEmails(prisma, lead.id);
      if (rawCandidates.length === 0) {
        skippedNoEmails++;
        continue;
      }
      withSidecarEmails++;

      let chosen: {
        normalized: string;
        rawExtracted: string;
        confidence: GrowthLeadEmailConfidence;
      } | null = null;
      for (const raw of rawCandidates) {
        const parsed = parseGrowthLeadEmailInput(raw, { extractedFromNoisyText: true });
        if (parsed.kind === "valid") {
          chosen = {
            normalized: parsed.normalized,
            rawExtracted: parsed.rawExtracted,
            confidence: parsed.confidence,
          };
          break;
        }
      }
      if (!chosen) {
        skippedNoValidParse++;
        continue;
      }

      const conflict = await prisma.growthLead.findFirst({
        where: { contactEmailNormalized: chosen.normalized, NOT: { id: lead.id } },
        select: { id: true },
      });
      if (conflict) {
        skippedPrimaryConflict++;
        console.warn(
          `[backfill] skip lead=${lead.id} email=${chosen.normalized} conflict_lead=${conflict.id}`,
        );
        continue;
      }

      if (!opts.apply) {
        rowsWouldUpdate++;
        console.info(
          `[backfill] would_update lead=${lead.id} type=${lead.leadType} email=${chosen.normalized} conf=${chosen.confidence}`,
        );
        continue;
      }

      const result = await prisma.growthLead.updateMany({
        where: { id: lead.id, contactEmailNormalized: null },
        data: {
          contactEmailNormalized: chosen.normalized,
          contactEmailRaw: chosen.rawExtracted,
          contactEmailConfidence: chosen.confidence,
          contactEmailRejectionReason: null,
          ...(lead.contactQuality == null ? { contactQuality: "EMAIL" } : {}),
        },
      });
      if (result.count === 0) {
        skippedUpdateNoop++;
      } else {
        rowsUpdated++;
        console.info(`[backfill] updated lead=${lead.id} email=${chosen.normalized} conf=${chosen.confidence}`);
      }
    }

    console.info(
      `[backfill] summary scanned=${scanned} with_sidecar_emails=${withSidecarEmails} rows_updated=${rowsUpdated} rows_would_update=${rowsWouldUpdate} skipped_already_primary=${skippedAlreadyHasPrimary} skipped_no_sidecar=${skippedNoEmails} skipped_no_valid_parse=${skippedNoValidParse} skipped_primary_conflict=${skippedPrimaryConflict} skipped_update_noop=${skippedUpdateNoop}`,
    );
    if (!opts.apply) {
      console.info("[backfill] re-run with --apply to persist changes.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
