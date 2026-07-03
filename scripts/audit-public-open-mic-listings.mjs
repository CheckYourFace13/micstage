/**
 * Quarantine existing public open mic listings whose NAME looks like an
 * article, listicle, generic page title, or scraped URL/path fragment.
 *
 * Non-destructive: matching rows are moved to verificationStatus=OUTDATED
 * (hidden from all public surfaces) with a rejection reason appended to
 * internalNotes. Rows are kept for audit in the admin console. Claimed
 * listings are never touched.
 *
 * Usage:
 *   node scripts/audit-public-open-mic-listings.mjs            # dry run (default)
 *   node scripts/audit-public-open-mic-listings.mjs --apply    # write changes
 *   node scripts/audit-public-open-mic-listings.mjs --apply --limit=500
 *
 * IMPORTANT: keep the pattern list in sync with
 * src/lib/publicListings/listingQuality.ts (scripts cannot import TS).
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

// --- Name-quality patterns (keep in sync with listingQuality.ts) ---
const GENERIC_PAGE_TITLE =
  /^(write|events?|event\s+venue|stand|home(?:page)?|home-\d+|local\s+events|all\s+events|upcoming(?:\s+events)?|calendar|schedule|contact(?:\s+us)?|about(?:\s+us)?|menus?|hours|our\s+hours|directions|locations?|venues?|gallery|photos?|blog|news|faqs?|log\s?in|sign\s?in|sign\s?up|signup|register|search|tickets|buy\s+tickets|shop|store|privacy(?:\s+policy)?|terms(?:\s+of\s+service)?|page\s+not\s+found|not\s+found|404|error|coming\s+soon|under\s+construction|what'?s\s+on|book\s+now|reservations?|reserve|more\s+info|learn\s+more|read\s+more|click\s+here|untitled|default|sample\s+page|test|welcome|account\s+suspended|open\s?mic|open\s?mic\s+night)$/i;

const LISTICLE =
  /(^\s*\d{1,3}\s*\+?\s+(best|top|great|amazing|fun|cheap|hidden|underrated|awesome|coolest|ultimate|things?|reasons?|ways?|ideas?)\b)|(^\s*\d{1,3}\s*\+?\s+(?:\S+\s+){0,6}(places?|venues?|clubs?|mics?|spots?|bars?|reasons?|ways?|ideas?|things?)\s+\S)|(^\s*(top|best)\s+\d{1,3}\b)|(\b\d{1,3}\s+(best|things\s+to\s+do|open\s?mics?|comedy\s+clubs?|live\s+music\s+venues?)\b)/i;

const DATE_ARTICLE =
  /(^(19|20)\d{2}$)|(^(19|20)\d{2}\s+(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter|guide|events?|roundup|recap)\b)|(\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b)|(\b(events?|shows?|tickets?|schedule|calendar|concerts?|open\s?mic|line-?up|festival|nightlife)\b[\s\S]*\b(19|20)\d{2}$)|(^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$)|(^\d{1,2}[./]\d{1,2}[./]\d{2,4}\b)/i;

const EDITORIAL =
  /(\bthings\s+to\s+do\b)|(\bnight\s+of\s+laughs\b)|(\btour\s+of\s+comedy\b)|(\bbest\s+(live\s+music|bars|comedy|places|things)\b)|(\b(nightlife|city|bar|drink|dining|music|comedy|visitors?|travel|ultimate|summer|winter|spring|fall|autumn|holiday|weekend|seasonal|annual)\s+guide\b)|(\bguide\s*[:|-])|(\bguide\s+to\b)|(\bguide$)|(\bcalendar\b)|(\blive\s+music\s+calendar\b)|(\bconcerts?\s+(19|20)\d{2}\b)|(\b(19|20)\d{2}\s+schedule\b)|(\btop\s+ten\b)|(\btop\s+10\b)|(\blist\s+of\b)|(\bround-?up\b)|(\bthis\s+weekend\b)|(\bthis\s+week\b)|(\bnear\s+you\b)|(\bmust[-\s](see|visit|try)\b)|(\bmust-chicago\b)|(\bhow\s+to\b)|(\breview:)|(\brecap\b)|(\b(ways|reasons)\s+to\b)|(\bsoloing\s+wings\b)|(\bstretch\s+my\b)|(\bkaraoke\b)|(\btrivia\b)|(\bpub\s+trivia\b)|(\bbandmix\b)|(\bprivate\s+events\b)|(\blive\s+music\s+trail\b)/i;

const PATH_OR_URL =
  /(:\/\/)|(\bwww\.)|(\.(com|net|org|io|co)\b)|(\.(html?|php|aspx?)\b)|(\/)|(::)|(")|(^[a-z0-9]+(?:-[a-z0-9]+)+$)/i;

/** Exact names called out in the audit brief that must be quarantined on sight. */
const EXPLICIT_DENYLIST = new Set(
  [
    "spectrum center charlotte",
    "10 best live music venues in charlotte, nc",
    "12 best comedy clubs in dallas for a night of laughs",
    "14 open mics to try standup comedy in dc",
    "24 things to do in the rockford area this weekend",
  ].map((s) => s.toLowerCase()),
);

function classifyName(name) {
  const n = (name ?? "").trim();
  if (!n || n.length < 4) return "TOO_SHORT";
  if (EXPLICIT_DENYLIST.has(n.toLowerCase())) return "GENERIC_PAGE_TITLE";
  if (GENERIC_PAGE_TITLE.test(n)) return "GENERIC_PAGE_TITLE";
  if (LISTICLE.test(n) || DATE_ARTICLE.test(n)) return "ARTICLE_OR_LISTICLE";
  if (PATH_OR_URL.test(n)) return "PATH_OR_URL_NAME";
  if (EDITORIAL.test(n)) return "NON_VENUE_TITLE";
  return null;
}

function appendNote(existing, reason) {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] quarantined: ${reason}`;
  const cur = (existing ?? "").trim();
  return cur ? `${cur}\n${line}` : line;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { in: ["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED"] },
    },
    orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
    ...(limit ? { take: limit } : {}),
    select: { id: true, slug: true, name: true, verificationStatus: true, internalNotes: true },
  });

  const byReason = {};
  let quarantined = 0;

  for (const row of rows) {
    const reason = classifyName(row.name);
    if (!reason) continue;
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    quarantined += 1;

    const label = `${reason} (${row.verificationStatus})`;
    if (!apply) {
      console.log(`[dry-run] OUTDATED  ${row.slug.padEnd(40)} ${label}  ${row.name}`);
      continue;
    }
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        verificationStatus: "OUTDATED",
        internalNotes: appendNote(row.internalNotes, reason),
      },
    });
    console.log(`OUTDATED  ${row.slug.padEnd(40)} ${label}`);
  }

  console.log(
    JSON.stringify(
      { ok: true, apply, scanned: rows.length, quarantined, byReason, limit: limit ?? null },
      null,
      2,
    ),
  );
  if (!apply && quarantined > 0) {
    console.log("\nDry run only. Re-run with --apply to move these to OUTDATED.");
  }
} finally {
  await prisma.$disconnect();
}
