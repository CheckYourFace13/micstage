/**
 * One-time purge of Google Maps Content that we are not permitted to retain, plus retirement of
 * leads that the tightened venue gates would now reject.
 *
 * Keeps: place ids (retention-exempt), match scores, our own derived conclusions, and any
 * name/address/website that came from our own crawl.
 *
 * Usage: npx tsx scripts/purge-google-place-content.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const { isUsableVenueName } = await import("../src/lib/growth/discovery/venueCandidateExtraction.ts");

const out = { mode: APPLY ? "APPLY" : "DRY_RUN" };

// 1. Google business names / addresses / websites: no retention grant, and nothing reads them.
const leadContentWhere = {
  NOT: { placeCanonicalName: null, placeFormattedAddress: null, placeLat: null, placeLng: null },
};
out.leadsHoldingGoogleContent = await prisma.growthLead.count({ where: leadContentWhere });

const cacheContentWhere = {
  NOT: { canonicalName: null, formattedAddress: null, website: null, websiteHost: null },
};
out.cacheRowsHoldingGoogleContent = await prisma.growthPlaceLookup.count({ where: cacheContentWhere });

// 2. Leads the tightened gates would now reject (production companies, publishers, page titles).
const suspects = await prisma.growthLead.findMany({
  where: {
    leadType: "VENUE",
    status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
    source: { in: ["directory_lead_reprocess", "autonomous_web_search_venue_directory_extraction"] },
  },
  select: { id: true, name: true, internalNotes: true, _count: { select: { outreachDrafts: true } } },
});
const nowRejected = suspects.filter((l) => !isUsableVenueName(l.name) && l._count.outreachDrafts === 0);
out.leadsNowFailingNameGate = nowRejected.length;
out.leadsNowFailingNameGateExamples = nowRejected.slice(0, 10).map((l) => l.name);

if (APPLY) {
  out.leadContentPurged = (
    await prisma.growthLead.updateMany({
      where: leadContentWhere,
      data: { placeCanonicalName: null, placeFormattedAddress: null, placeLat: null, placeLng: null },
    })
  ).count;

  out.cacheContentPurged = (
    await prisma.growthPlaceLookup.updateMany({
      where: cacheContentWhere,
      data: { canonicalName: null, formattedAddress: null, website: null, websiteHost: null },
    })
  ).count;

  let retired = 0;
  for (const lead of nowRejected) {
    await prisma.growthLead.update({
      where: { id: lead.id },
      data: {
        status: "REJECTED",
        internalNotes: `${lead.internalNotes ?? ""}\n[${new Date().toISOString().slice(0, 10)}] Non-target: fails tightened venue identity gate (publisher/production/non-hospitality entity).`.trim(),
      },
    });
    retired += 1;
  }
  out.leadsRetired = retired;
}

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
