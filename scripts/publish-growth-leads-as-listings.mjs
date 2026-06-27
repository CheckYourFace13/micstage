/**
 * Publish growth leads with open-mic signal as PublicOpenMicListing rows.
 *
 * Usage: DATABASE_URL=... node scripts/publish-growth-leads-as-listings.mjs [--limit=50] [--dry-run]
 */
import { PrismaClient } from "../src/generated/prisma/index.js";

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

const prisma = new PrismaClient();

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
    if (!baseName) continue;

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
    console.log("created", slug);
  }

  console.log(JSON.stringify({ ok: true, created, dryRun, candidates: leads.length }, null, 2));
} finally {
  await prisma.$disconnect();
}
