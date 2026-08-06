/**
 * Re-score GrowthLead contact emails: same-domain official website → HIGH.
 * Dry-run by default. Does not invent emails — only upgrades confidence.
 *
 * Usage:
 *   node scripts/rescore-same-domain-email-confidence.mjs
 *   node scripts/rescore-same-domain-email-confidence.mjs --apply --limit=500
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
const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 500) : 2000;

const FREE_OR_DISPOSABLE = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
]);

const THIRD_PARTY = [
  "facebook.com",
  "fb.com",
  "eventbrite.com",
  "yelp.com",
  "tripadvisor.",
  "bandsintown.com",
  "songkick.com",
  "ticketmaster.",
  "meetup.com",
  "instagram.com",
  "livenation.com",
  "axs.com",
  "dice.fm",
  "badslava.com",
  "openmikes.org",
  "bandmix.com",
  "visitlex.com",
  "timeout.com",
  "thrillist.com",
  "do512.com",
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
  const i = email.lastIndexOf("@");
  if (i < 0) return null;
  return email.slice(i + 1).toLowerCase().replace(/^www\./, "") || null;
}

function related(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function isThirdParty(host) {
  return THIRD_PARTY.some((p) => host === p || host.endsWith(p) || host.includes(p));
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const before = await prisma.growthLead.groupBy({
    by: ["contactEmailConfidence"],
    _count: true,
  });

  const rows = await prisma.growthLead.findMany({
    where: {
      contactEmailNormalized: { not: null },
      contactEmailConfidence: { in: ["MEDIUM", "LOW"] },
      websiteUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      contactEmailNormalized: true,
      contactEmailConfidence: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const upgrades = [];
  const skipped = { free: 0, thirdParty: 0, noMatch: 0, noHost: 0, badName: 0 };

  for (const row of rows) {
    if (!isPublicListingNameOk(row.name)) {
      skipped.badName += 1;
      continue;
    }
    const email = row.contactEmailNormalized?.trim().toLowerCase();
    if (!email) continue;
    const emailHost = hostFromEmail(email);
    const siteHost = hostFromUrl(row.websiteUrl);
    if (!emailHost || !siteHost) {
      skipped.noHost += 1;
      continue;
    }
    if (FREE_OR_DISPOSABLE.has(emailHost)) {
      skipped.free += 1;
      continue;
    }
    if (isThirdParty(emailHost) || isThirdParty(siteHost)) {
      skipped.thirdParty += 1;
      continue;
    }
    if (!related(emailHost, siteHost)) {
      skipped.noMatch += 1;
      continue;
    }
    upgrades.push({
      id: row.id,
      name: row.name,
      email,
      from: row.contactEmailConfidence,
      websiteUrl: row.websiteUrl,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        scanned: rows.length,
        upgradeToHigh: upgrades.length,
        skipped,
        before,
        samples: upgrades.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to upgrade confidence.");
    process.exit(0);
  }

  let updated = 0;
  for (const u of upgrades) {
    await prisma.growthLead.update({
      where: { id: u.id },
      data: { contactEmailConfidence: "HIGH" },
    });
    updated += 1;
  }

  const after = await prisma.growthLead.groupBy({
    by: ["contactEmailConfidence"],
    _count: true,
  });

  console.log(JSON.stringify({ ok: true, updated, after }, null, 2));
} finally {
  await prisma.$disconnect();
}
