/**
 * Audit HIGH-confidence growth leads for unsafe domain/agency/directory cases.
 * Dry-run by default; --apply demotes unsafe rows back to MEDIUM.
 *
 * Usage:
 *   node scripts/audit-high-email-confidence.mjs
 *   node scripts/audit-high-email-confidence.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

const UNSAFE_HOST_FRAGMENTS = [
  "livenation.",
  "ticketmaster.",
  "axs.com",
  "dice.fm",
  "eventbrite.",
  "meetup.",
  "facebook.",
  "fb.com",
  "instagram.",
  "yelp.",
  "tripadvisor.",
  "badslava.",
  "openmikes.",
  "bandmix.",
  "timeout.",
  "thrillist.",
  "do512.",
  "visitlex.",
  "squarespace.",
  "wix.",
  "weebly.",
  "godaddy.",
  "webflow.",
  "wordpress.com",
  "google.",
  "gmail.",
  "outlook.",
  "yahoo.",
  "hotmail.",
  "agency",
  "digitalmarketing",
  "webdesign",
  "seoagency",
  "marketingagency",
];

const CORPORATE_PARENT = [
  "livenation.com",
  "aegpresents.com",
  "bowerypresents.com",
  "anotherplanet.com",
];

function hostFromUrl(u) {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
function hostFromEmail(email) {
  const i = String(email).lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}
function related(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
function unsafeHost(h) {
  if (!h) return "NO_HOST";
  if (CORPORATE_PARENT.includes(h)) return "CORPORATE_PARENT";
  for (const f of UNSAFE_HOST_FRAGMENTS) {
    if (h.includes(f) || h.endsWith(f.replace(/\.$/, ""))) return `UNSAFE_FRAGMENT:${f}`;
  }
  return null;
}
function redactEmail(e) {
  const at = e.indexOf("@");
  if (at < 0) return "***";
  return `${e.slice(0, 1)}***@${e.slice(at + 1)}`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const outDir = path.join("tmp", "prod-baselines");
fs.mkdirSync(outDir, { recursive: true });

try {
  const rows = await prisma.growthLead.findMany({
    where: { contactEmailConfidence: "HIGH", contactEmailNormalized: { not: null } },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      contactEmailNormalized: true,
      contactEmailConfidence: true,
      sourceKind: true,
      leadType: true,
    },
  });

  const keep = [];
  const demote = [];

  for (const row of rows) {
    const email = row.contactEmailNormalized.trim().toLowerCase();
    const emailHost = hostFromEmail(email);
    const siteHost = hostFromUrl(row.websiteUrl);
    const reasons = [];

    if (!isPublicListingNameOk(row.name)) reasons.push("BAD_LISTING_NAME");
    const emailUnsafe = unsafeHost(emailHost);
    const siteUnsafe = unsafeHost(siteHost);
    if (emailUnsafe) reasons.push(emailUnsafe);
    if (siteUnsafe) reasons.push(siteUnsafe);
    if (!emailHost || !siteHost) reasons.push("MISSING_HOST");
    else if (!related(emailHost, siteHost)) reasons.push("DOMAIN_MISMATCH");

    // Parent-company vs local venue brand: email on large parent while site is local brand
    if (emailHost && siteHost && emailHost !== siteHost && CORPORATE_PARENT.includes(emailHost)) {
      reasons.push("PARENT_COMPANY_EMAIL");
    }

    const audit = {
      idHash: createHash("sha256").update(row.id).digest("hex").slice(0, 16),
      name: row.name,
      leadType: row.leadType,
      sourceKind: row.sourceKind,
      emailRedacted: redactEmail(email),
      emailHost,
      websiteHost: siteHost,
      previousConfidence: "HIGH",
      newConfidence: reasons.length ? "MEDIUM" : "HIGH",
      reasons,
    };

    if (reasons.length) demote.push({ row, audit });
    else keep.push(audit);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const auditPath = path.join(outDir, `high-email-audit-${stamp}.json`);
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        apply,
        totalHigh: rows.length,
        keepSafe: keep.length,
        demoteUnsafe: demote.length,
        demoteSamples: demote.slice(0, 40).map((d) => d.audit),
        keepSamples: keep.slice(0, 20),
        allDemotions: demote.map((d) => d.audit),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        totalHigh: rows.length,
        keepSafe: keep.length,
        demoteUnsafe: demote.length,
        auditPath,
        demoteReasonCounts: demote.reduce((acc, d) => {
          for (const r of d.audit.reasons) acc[r] = (acc[r] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to demote unsafe HIGH → MEDIUM.");
    process.exit(0);
  }

  let updated = 0;
  for (const d of demote) {
    await prisma.growthLead.update({
      where: { id: d.row.id },
      data: { contactEmailConfidence: "MEDIUM" },
    });
    updated += 1;
  }
  const after = await prisma.growthLead.groupBy({ by: ["contactEmailConfidence"], _count: true });
  console.log(JSON.stringify({ ok: true, demoted: updated, after }, null, 2));
} finally {
  await prisma.$disconnect();
}
