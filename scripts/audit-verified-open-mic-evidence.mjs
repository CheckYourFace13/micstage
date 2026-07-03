/**
 * Demote existing VERIFIED public open mic listings that were promoted by
 * place-match alone (e.g. via Google Places) but have NO explicit open-mic
 * evidence tied to the listing.
 *
 * Rule: a listing may stay VERIFIED (public) only if it has BOTH
 *   A) a verified place identity (Google place / claimed venue / admin), and
 *   B) explicit open-mic evidence in the listing NAME or a real SCHEDULE
 *      title/description.
 * VERIFIED rows failing (B) are demoted to NEEDS_REVIEW (hidden, kept in the
 * admin review queue). Place fields, coordinates, and Google metadata are
 * preserved. Claimed listings are never touched.
 *
 * Usage:
 *   node scripts/audit-verified-open-mic-evidence.mjs            # dry run (default)
 *   node scripts/audit-verified-open-mic-evidence.mjs --apply    # write changes
 *   node scripts/audit-verified-open-mic-evidence.mjs --apply --limit=500
 *
 * IMPORTANT: keep EXPLICIT_OPEN_MIC_PATTERN in sync with
 * src/lib/publicListings/openMicEvidence.ts (scripts cannot import TS).
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

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

const url =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 0) : undefined;

// Keep in sync with src/lib/publicListings/openMicEvidence.ts
const PLACE_ONLY_REASON = "GOOGLE_PLACE_CONFIRMED_OPEN_MIC_EVIDENCE_MISSING";

const EXPLICIT_OPEN_MIC_PATTERN =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen[\s-]?mic\s*(?:night|signup|sign[\s-]?up)\b)|(\bopen\s+jam\b)|(\bopen\s+blues\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bsongwriter\s+(?:open\s*mic|night)\b)|(\bspoken\s+word\s+open\s*mic\b)/i;

function explicitOpenMicMatch(text) {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}

function detectOpenMicEvidence(listing) {
  const nameMatch = explicitOpenMicMatch(listing.name);
  if (nameMatch) return { hasEvidence: true, source: "name", snippet: nameMatch };
  for (const s of listing.schedules ?? []) {
    const m = explicitOpenMicMatch(s.title) ?? explicitOpenMicMatch(s.description);
    if (m) return { hasEvidence: true, source: "schedule", snippet: m };
  }
  return { hasEvidence: false, source: null, snippet: null };
}

function appendNote(existing, reason) {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] evidence audit: ${reason}`;
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: "VERIFIED",
    },
    orderBy: [{ updatedAt: "desc" }],
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      internalNotes: true,
      schedules: { select: { title: true, description: true } },
    },
  });

  let kept = 0;
  let demoted = 0;

  for (const row of rows) {
    const evidence = detectOpenMicEvidence(row);
    if (evidence.hasEvidence) {
      kept += 1;
      continue;
    }
    demoted += 1;
    if (!apply) {
      console.log(`[dry-run] NEEDS_REVIEW  ${row.slug.padEnd(44)} ${row.name}`);
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "NEEDS_REVIEW",
        internalNotes: appendNote(row.internalNotes, PLACE_ONLY_REASON),
      },
    });
    console.log(`NEEDS_REVIEW  ${row.slug.padEnd(44)} ${row.name}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        scanned: rows.length,
        keptVerified: kept,
        demotedToNeedsReview: demoted,
        limit: limit ?? null,
      },
      null,
      2,
    ),
  );
  if (!apply && demoted > 0) {
    console.log("\nDry run only. Re-run with --apply to demote these to NEEDS_REVIEW.");
  }
} finally {
  await prisma.$disconnect();
}
