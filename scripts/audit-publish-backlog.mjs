/**
 * Classify why LEAD_PUBLISH_WHERE backlog is not publishing.
 * Usage: npx tsx scripts/audit-publish-backlog.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { classifyListingName } from "../src/lib/publicListings/listingQuality.ts";
import { listingHasGeoConflict } from "../src/lib/publicListings/evidenceTrust.ts";

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
loadEnvFile(".env");

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const LEAD_PUBLISH_WHERE = {
  leadType: "VENUE",
  status: { notIn: ["REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
  openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
  NOT: { publicListings: { some: {} } },
};

const leads = await prisma.growthLead.findMany({
  where: LEAD_PUBLISH_WHERE,
  select: {
    id: true,
    name: true,
    city: true,
    suburb: true,
    region: true,
    websiteUrl: true,
    source: true,
    openMicSignalTier: true,
    internalNotes: true,
    discoveryMarketSlug: true,
    updatedAt: true,
    status: true,
  },
});

const reasons = {};
const bump = (k) => {
  reasons[k] = (reasons[k] || 0) + 1;
};

for (const lead of leads) {
  const name = (lead.name || "").trim();
  if (!name) {
    bump("missing_name");
    continue;
  }
  const nameReject = classifyListingName(name);
  if (nameReject) {
    bump(`failed_classifier_${nameReject}`);
    continue;
  }
  if (
    listingHasGeoConflict({
      region: lead.region,
      city: lead.city ?? lead.suburb,
      formattedAddress: [name, lead.city, lead.region].filter(Boolean).join(", "),
      name,
      discoveryMarketSlug: lead.discoveryMarketSlug,
    })
  ) {
    bump("geo_conflict");
    continue;
  }
  if (/PUBLISH_REJECTED|publish-reject/i.test(lead.internalNotes || "")) {
    bump("already_publish_rejected_note");
    continue;
  }
  // Would publish under current code
  bump("publishable_never_selected_or_tick_starved");
}

const sorted = Object.entries(reasons)
  .map(([reason, count]) => ({ reason, count }))
  .sort((a, b) => b.count - a.count);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: leads.length,
      reasons: sorted,
      publishable: reasons.publishable_never_selected_or_tick_starved || 0,
      classifierBlocked: sorted
        .filter((r) => r.reason.startsWith("failed_classifier_"))
        .reduce((a, b) => a + b.count, 0),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
