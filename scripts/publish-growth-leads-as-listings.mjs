/**
 * Publish growth leads with open-mic signal as PublicOpenMicListing rows.
 *
 * Usage: node scripts/publish-growth-leads-as-listings.mjs [--limit=50] [--dry-run]
 * Loads DATABASE_URL from env or .env.local / .env
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
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL — set $env:DATABASE_URL in PowerShell or add .env.local");
  process.exit(1);
}

const JUNK_NAME =
  /\b(karaoke|trivia|best bars|nightlife guide|review:|must-chicago|bandmix|pub trivia|private events|how to|blog|list of all)\b/i;

function looksLikeOpenMic(name) {
  const n = name.trim();
  if (!n || n.length < 3) return false;
  if (JUNK_NAME.test(n)) return false;
  if (/^home(-\d+)?$/i.test(n)) return false;
  return true;
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 50;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const existingSlugs = new Set(
    (await prisma.publicOpenMicListing.findMany({ select: { slug: true } })).map((r) => r.slug),
  );

  const leads = await prisma.growthLead.findMany({
    where: {
      leadType: "VENUE",
      openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
      NOT: { publicListings: { some: {} } },
    },
    orderBy: { updatedAt: "desc" },
    take: Number.isFinite(limit) ? limit : 50,
  });

  let created = 0;
  for (const lead of leads) {
    const city = (lead.city ?? lead.suburb ?? "").trim();
    const baseName = lead.name.trim();
    if (!baseName || !looksLikeOpenMic(baseName)) continue;

    const slugBase = slugify(city ? `${baseName}-${city}` : baseName) || slugify(baseName) || `listing-${lead.id.slice(0, 8)}`;
    const slug = uniqueSlug(slugBase, existingSlugs);

    const formattedAddress = [baseName, city, lead.region].filter(Boolean).join(", ") || baseName;

    const data = {
      name: baseName,
      slug,
      formattedAddress,
      city: city || null,
      region: lead.region,
      country: "US",
      websiteUrl: lead.websiteUrl,
      facebookUrl: lead.facebookUrl,
      instagramUrl: lead.instagramUrl,
      tiktokUrl: lead.tiktokUrl,
      youtubeUrl: lead.youtubeUrl,
      sourceName: lead.source ?? "MicStage growth discovery",
      verificationStatus: lead.openMicSignalTier === "EXPLICIT_OPEN_MIC" ? "VERIFIED" : "NEEDS_REVIEW",
      lastVerifiedAt: new Date(),
      growthLeadId: lead.id,
      internalNotes: `Auto-published from growth lead ${lead.id}`,
    };

    if (dryRun) {
      console.log("[dry-run] would create", slug, data.name);
      created += 1;
      continue;
    }

    await prisma.publicOpenMicListing.create({ data });
    created += 1;
    console.log("created", slug, "(claim invite will send on next growth cron tick if lead has email)");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        dryRun,
        candidates: leads.length,
        note: "Claim invite emails send via /api/cron/growth-pipeline (runPendingListingClaimInvites)",
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
