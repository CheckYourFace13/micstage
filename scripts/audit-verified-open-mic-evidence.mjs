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
import { isPublicListingNameOk } from "./lib/listingNameClassifier.mjs";

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

// --- Open-mic evidence model (keep in sync with src/lib/publicListings/openMicEvidence.ts) ---
const PLACE_ONLY_REASON = "GOOGLE_PLACE_CONFIRMED_OPEN_MIC_EVIDENCE_MISSING";
const UNTRUSTED_REASON = "OPEN_MIC_EVIDENCE_UNTRUSTED_SOURCE";

const EXPLICIT_OPEN_MIC_PATTERN =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen[\s-]?mic\s*(?:night|signup|sign[\s-]?up)\b)|(\bopen\s+jam\b)|(\bopen\s+blues\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bsongwriter\s+(?:open\s*mic|night)\b)|(\bspoken\s+word\s+open\s*mic\b)/i;

const NON_EVIDENCE_NOISE = [
  /open[\s-]?mic venue identified from public listings and web search\.?/gi,
  /live music venue with open mic or performer signup signals\.?/gi,
  /open[\s\u2013-]?mic[\s\u2013-]*targeted nationwide discovery\.?/gi,
  /\bquery:\s*[^.]*\.?/gi,
  /\btier\s+[a-z0-9_]+\b/gi,
  /\bmarket\s+[a-z0-9-]+\b/gi,
  /discovered via [^.]*\.?/gi,
  /\[micstage_email_meta\][^.]*\.?/gi,
];
const LISTICLE_OR_ARTICLE =
  /(^\s*\d{1,3}\s*\+?\s+(best|top|great|things?|reasons?|ways?|places?|venues?|clubs?|mics?|spots?|bars?)\b)|(\bthings\s+to\s+do\b)|(\bbest\s+(live\s+music|bars|comedy|places|things)\b)|(\bguide\s+to\b)/i;
const TRUSTED_SOURCE_KINDS = new Set([
  "WEBSITE_CONTACT",
  "SOCIAL_PROFILE",
  "EVENT_LISTING",
  "CSV_IMPORT",
  "CLAUDE_CSV",
  "MANUAL_ADMIN",
]);
const HINT_EVIDENCE_KEYS = ["eventTitle", "eventDescription", "evidenceSnippet", "openMicEvidence", "pageTitle", "sourceTitle"];

function stripNonEvidenceNoise(text) {
  let t = ` ${text} `;
  for (const re of NON_EVIDENCE_NOISE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}
function explicitOpenMicMatch(text) {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}
function explicitOpenMicMatchClean(text) {
  if (!text) return null;
  return explicitOpenMicMatch(stripNonEvidenceNoise(text));
}
function hostOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
function sourceOnVenueDomain(sourceUrl, websiteUrl) {
  const a = hostOf(sourceUrl);
  const b = hostOf(websiteUrl);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
function collectHintEvidenceStrings(hints) {
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return [];
  const out = [];
  for (const k of HINT_EVIDENCE_KEYS) {
    const v = hints[k];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}
function extractDiscoverySnippet(internalNotes) {
  if (!internalNotes) return null;
  const idx = internalNotes.indexOf("Snippet:");
  if (idx === -1) return null;
  let s = internalNotes.slice(idx + "Snippet:".length).trim();
  s = s.replace(/Page fetch failed[^.]*\.?/i, "").replace(/scored from SERP only\.?/i, "").trim();
  s = s.replace(/^["'\s]+|["'\s.]+$/g, "").trim();
  return s.length >= 3 ? s : null;
}
function evaluateOpenMicEvidence(input) {
  const kindTrusted = input.sourceKind && TRUSTED_SOURCE_KINDS.has(input.sourceKind);
  const onDomain = sourceOnVenueDomain(input.sourceUrl, input.websiteUrl);
  const validName = !!input.listingName && isPublicListingNameOk(input.listingName);
  const structuredTrust = validName && (kindTrusted || onDomain);

  const nameMatch = validName ? explicitOpenMicMatch(input.listingName) : null;
  if (nameMatch) return { hasEvidence: true, trusted: true, field: "name", snippet: nameMatch };

  for (const s of input.schedules ?? []) {
    const text = [s.title, s.description].filter(Boolean).join(" — ");
    const m = explicitOpenMicMatchClean(text);
    if (m) return { hasEvidence: true, trusted: true, field: "schedule", snippet: m };
  }

  // Structured extracted evidence can be trusted; raw SERP snippet is review-only.
  let untrusted = null;
  const candidates = [];
  for (const t of collectHintEvidenceStrings(input.discoveryHints)) candidates.push({ field: "discoveryHints", text: t, titleLike: true, canTrust: structuredTrust });
  if (input.sourceSnippet) candidates.push({ field: "sourceSnippet", text: input.sourceSnippet, titleLike: false, canTrust: false });

  for (const c of candidates) {
    if (c.titleLike && LISTICLE_OR_ARTICLE.test(c.text)) continue;
    const m = explicitOpenMicMatchClean(c.text);
    if (!m) continue;
    const res = { hasEvidence: true, trusted: c.canTrust, field: c.field, snippet: m };
    if (res.trusted) return res;
    if (!untrusted) untrusted = res;
  }
  return untrusted ?? { hasEvidence: false, trusted: false, field: null, snippet: null };
}
function buildEvidenceInput(row) {
  return {
    listingName: row.name,
    schedules: row.schedules,
    sourceSnippet: extractDiscoverySnippet(row.growthLead?.internalNotes),
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: row.growthLead?.sourceKind ?? null,
  };
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
      sourceUrl: true,
      websiteUrl: true,
      schedules: { select: { title: true, description: true } },
      growthLead: { select: { sourceKind: true, internalNotes: true, discoveryHints: true } },
    },
  });

  let kept = 0;
  let demoted = 0;

  for (const row of rows) {
    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    // Public VERIFIED requires TRUSTED, venue-tied evidence. Untrusted-only or
    // missing evidence is demoted to NEEDS_REVIEW for admin review.
    if (evidence.trusted) {
      kept += 1;
      continue;
    }
    demoted += 1;
    const reason = evidence.hasEvidence
      ? `${UNTRUSTED_REASON} (${evidence.field}: "${evidence.snippet}")`
      : PLACE_ONLY_REASON;
    if (!apply) {
      console.log(`[dry-run] NEEDS_REVIEW  ${row.slug.padEnd(44)} ${row.name}`);
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "NEEDS_REVIEW",
        internalNotes: appendNote(row.internalNotes, reason),
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
