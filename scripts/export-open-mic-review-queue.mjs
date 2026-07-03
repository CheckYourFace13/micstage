/**
 * Export all hidden NEEDS_REVIEW public open mic listings to a CSV for manual
 * review/approval. Read-only: makes NO database changes.
 *
 * Usage:
 *   node scripts/export-open-mic-review-queue.mjs
 *   node scripts/export-open-mic-review-queue.mjs --out=exports/open-mic-review-queue.csv
 *
 * recommendedAction (conservative):
 *   REJECT   - listing name fails the shared classifier (aggregator/listicle/generic/non-venue)
 *   MERGE    - duplicate Google place note, or same name+city as an existing VERIFIED/claimed venue
 *   APPROVE  - place identity verified AND trusted, venue-tied open-mic evidence
 *   RESEARCH - everything else (needs a human look)
 *
 * Evidence model mirrors src/lib/publicListings/openMicEvidence.ts (scripts cannot import TS).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { classifyListingName, isPublicListingNameOk } from "./lib/listingNameClassifier.mjs";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const url =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = outArg ? outArg.split("=")[1] : "exports/open-mic-review-queue.csv";

// --- Open-mic evidence model (mirror of src/lib/publicListings/openMicEvidence.ts) ---
const REASON = {
  CONFIRMED: "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED",
  UNTRUSTED: "OPEN_MIC_EVIDENCE_UNTRUSTED_SOURCE",
  MISSING: "NO_EXPLICIT_OPEN_MIC_EVIDENCE",
};
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
function hostOf(u) {
  if (!u) return null;
  try {
    return new URL(u.includes("://") ? u : `https://${u}`).hostname.replace(/^www\./i, "").toLowerCase() || null;
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
  if (nameMatch) return { hasEvidence: true, trusted: true, field: "name", snippet: nameMatch, reason: REASON.CONFIRMED };

  for (const s of input.schedules ?? []) {
    const text = [s.title, s.description].filter(Boolean).join(" — ");
    const m = explicitOpenMicMatchClean(text);
    if (m) return { hasEvidence: true, trusted: true, field: "schedule", snippet: m, reason: REASON.CONFIRMED };
  }

  let untrusted = null;
  const candidates = [];
  for (const t of collectHintEvidenceStrings(input.discoveryHints))
    candidates.push({ field: "discoveryHints", text: t, titleLike: true, canTrust: structuredTrust });
  if (input.sourceSnippet) candidates.push({ field: "sourceSnippet", text: input.sourceSnippet, titleLike: false, canTrust: false });

  for (const c of candidates) {
    if (c.titleLike && LISTICLE_OR_ARTICLE.test(c.text)) continue;
    const m = explicitOpenMicMatchClean(c.text);
    if (!m) continue;
    const res = {
      hasEvidence: true,
      trusted: c.canTrust,
      field: c.field,
      snippet: m,
      reason: c.canTrust ? REASON.CONFIRMED : REASON.UNTRUSTED,
    };
    if (res.trusted) return res;
    if (!untrusted) untrusted = res;
  }
  return untrusted ?? { hasEvidence: false, trusted: false, field: null, snippet: null, reason: REASON.MISSING };
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

function normKey(name, city) {
  return `${(name ?? "").trim().toLowerCase()}|${(city ?? "").trim().toLowerCase()}`;
}

const COLUMNS = [
  "id",
  "slug",
  "name",
  "city",
  "region",
  "formattedAddress",
  "sourceUrl",
  "sourceName",
  "websiteUrl",
  "instagramUrl",
  "facebookUrl",
  "googlePlaceId",
  "googlePlaceVerifiedAt",
  "lastVerifiedAt",
  "evidenceTrusted",
  "evidenceField",
  "evidenceSnippet",
  "evidenceReason",
  "internalNotes",
  "growthLeadId",
  "growthLeadSourceKind",
  "growthLeadDiscoveryMarketSlug",
  "growthLeadOpenMicSignalTier",
  "recommendedAction",
];

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  s = s.replace(/\r?\n/g, " \u00b7 ").replace(/\r/g, " ");
  if (/[",]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  // Build a dedupe key set from listings that are already public/claimed.
  const publicRows = await prisma.publicOpenMicListing.findMany({
    where: { OR: [{ verificationStatus: "VERIFIED" }, { claimedVenueId: { not: null } }] },
    select: { name: true, city: true },
  });
  const publicKeys = new Set(publicRows.map((r) => normKey(r.name, r.city)));

  const rows = await prisma.publicOpenMicListing.findMany({
    where: { claimedVenueId: null, verificationStatus: "NEEDS_REVIEW" },
    orderBy: [{ region: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      sourceUrl: true,
      sourceName: true,
      websiteUrl: true,
      instagramUrl: true,
      facebookUrl: true,
      googlePlaceId: true,
      googlePlaceVerifiedAt: true,
      lastVerifiedAt: true,
      internalNotes: true,
      growthLeadId: true,
      schedules: { select: { title: true, description: true } },
      growthLead: {
        select: {
          sourceKind: true,
          discoveryMarketSlug: true,
          openMicSignalTier: true,
          internalNotes: true,
          discoveryHints: true,
        },
      },
    },
  });

  const actionCounts = { APPROVE: 0, MERGE: 0, REJECT: 0, RESEARCH: 0 };
  const lines = [COLUMNS.join(",")];

  for (const row of rows) {
    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    const placeVerified = !!row.googlePlaceId && !!row.googlePlaceVerifiedAt;
    const nameReject = classifyListingName(row.name);
    const dupNote = /duplicate google place/i.test(row.internalNotes ?? "");
    const dupVenue = publicKeys.has(normKey(row.name, row.city));

    let action;
    if (nameReject) action = "REJECT";
    else if (dupNote || dupVenue) action = "MERGE";
    else if (placeVerified && evidence.trusted) action = "APPROVE";
    else action = "RESEARCH";
    actionCounts[action] += 1;

    const record = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      region: row.region,
      formattedAddress: row.formattedAddress,
      sourceUrl: row.sourceUrl,
      sourceName: row.sourceName,
      websiteUrl: row.websiteUrl,
      instagramUrl: row.instagramUrl,
      facebookUrl: row.facebookUrl,
      googlePlaceId: row.googlePlaceId,
      googlePlaceVerifiedAt: row.googlePlaceVerifiedAt,
      lastVerifiedAt: row.lastVerifiedAt,
      evidenceTrusted: evidence.trusted,
      evidenceField: evidence.field,
      evidenceSnippet: evidence.snippet,
      evidenceReason: evidence.reason,
      internalNotes: row.internalNotes,
      growthLeadId: row.growthLeadId,
      growthLeadSourceKind: row.growthLead?.sourceKind ?? null,
      growthLeadDiscoveryMarketSlug: row.growthLead?.discoveryMarketSlug ?? null,
      growthLeadOpenMicSignalTier: row.growthLead?.openMicSignalTier ?? null,
      recommendedAction: action,
    };
    lines.push(COLUMNS.map((c) => csvCell(record[c])).join(","));
  }

  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "\ufeff" + lines.join("\r\n") + "\r\n", "utf8");

  console.log(
    JSON.stringify(
      { ok: true, out: outPath, rows: rows.length, recommendedActionCounts: actionCounts },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
