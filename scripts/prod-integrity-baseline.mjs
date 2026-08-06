/**
 * Pre-deploy production integrity baseline (read-only).
 * Writes a timestamped JSON under tmp/ (gitignored) — no secrets, emails redacted.
 *
 * Usage: node scripts/prod-integrity-baseline.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

function redactEmail(e) {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at < 0) return "***";
  return `${e.slice(0, 1)}***@${e.slice(at + 1)}`;
}

function hashId(id) {
  return createHash("sha256").update(String(id)).digest("hex").slice(0, 16);
}

function hashSecret(s) {
  if (!s) return null;
  return createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join("tmp", "prod-baselines");
fs.mkdirSync(outDir, { recursive: true });

try {
  const [
    venueOwners,
    venues,
    venueManagers,
    musicians,
    promoters,
    listingsByStatus,
    listingsByClaim,
    schedules,
    templates,
    instances,
    slots,
    bookings,
    leads,
    contacts,
    sends,
    suppressions,
    claimRequests,
    corrections,
    discoveryCursors,
    discoveryRuns,
  ] = await Promise.all([
    prisma.venueOwner.findMany({ select: { id: true, email: true, passwordHash: true, createdAt: true } }),
    prisma.venue.findMany({ select: { id: true, ownerId: true, slug: true, name: true, createdAt: true } }),
    prisma.venueManager.count(),
    prisma.musicianUser.findMany({ select: { id: true, email: true, passwordHash: true, createdAt: true } }),
    prisma.promoterUser.findMany({ select: { id: true, email: true, passwordHash: true, createdAt: true } }),
    prisma.publicOpenMicListing.groupBy({ by: ["verificationStatus"], _count: true }),
    prisma.publicOpenMicListing.groupBy({ by: ["claimStatus"], _count: true }),
    prisma.publicOpenMicSchedule.count(),
    prisma.eventTemplate.count(),
    prisma.eventInstance.count(),
    prisma.slot.count(),
    prisma.booking.count(),
    prisma.growthLead.count(),
    prisma.marketingContact.count(),
    prisma.marketingEmailSend.count(),
    prisma.marketingEmailSuppression.count(),
    prisma.listingClaimRequest.count(),
    prisma.listingCorrection.count(),
    prisma.growthDiscoveryCursor.findMany({
      select: { adapterId: true, marketSlug: true, cursorKey: true, updatedAt: true, value: true },
    }),
    prisma.growthDiscoveryRun.count(),
  ]);

  const highLeads = await prisma.growthLead.count({ where: { contactEmailConfidence: "HIGH" } });
  const mediumLeads = await prisma.growthLead.count({ where: { contactEmailConfidence: "MEDIUM" } });

  const baseline = {
    capturedAt: new Date().toISOString(),
    gitTarget: "e73c537",
    previousProductionCommitHint: "1fdba5c (pre-growth-funnel; confirm live Hostinger SHA separately)",
    dbProvider: "Supabase PostgreSQL (pooler host from Prisma migrate status)",
    migrations: "no schema changes in e73c537; migrate status was up to date",
    counts: {
      venueOwners: venueOwners.length,
      venues: venues.length,
      venueManagers,
      musicians: musicians.length,
      promoters: promoters.length,
      listingsByStatus,
      listingsByClaim,
      schedules,
      templates,
      instances,
      slots,
      bookings,
      leads,
      contacts,
      sends,
      suppressions,
      claimRequests,
      corrections,
      discoveryRuns,
      highLeads,
      mediumLeads,
    },
    accountIntegrity: {
      venueOwners: venueOwners.map((o) => ({
        idHash: hashId(o.id),
        emailRedacted: redactEmail(o.email),
        passwordHashFingerprint: hashSecret(o.passwordHash),
        createdAt: o.createdAt,
      })),
      venues: venues.map((v) => ({
        idHash: hashId(v.id),
        ownerIdHash: hashId(v.ownerId),
        slug: v.slug,
        name: v.name,
        createdAt: v.createdAt,
      })),
      musicians: musicians.map((m) => ({
        idHash: hashId(m.id),
        emailRedacted: redactEmail(m.email),
        passwordHashFingerprint: hashSecret(m.passwordHash),
        createdAt: m.createdAt,
      })),
      promoters: promoters.map((p) => ({
        idHash: hashId(p.id),
        emailRedacted: redactEmail(p.email),
        passwordHashFingerprint: hashSecret(p.passwordHash),
        createdAt: p.createdAt,
      })),
    },
    discoveryCursors: discoveryCursors.map((c) => ({
      adapterId: c.adapterId,
      marketSlug: c.marketSlug,
      cursorKey: c.cursorKey,
      updatedAt: c.updatedAt,
      valuePreview: String(c.value).slice(0, 120),
    })),
  };

  const outPath = path.join(outDir, `baseline-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        counts: baseline.counts,
        accountFingerprints: {
          venueOwners: baseline.accountIntegrity.venueOwners.length,
          venues: baseline.accountIntegrity.venues.length,
          musicians: baseline.accountIntegrity.musicians.length,
          promoters: baseline.accountIntegrity.promoters.length,
        },
        cursorCount: baseline.discoveryCursors.length,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
