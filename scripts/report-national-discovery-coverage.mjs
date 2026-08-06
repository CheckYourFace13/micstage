/**
 * Nationwide discovery coverage report (50 states + DC).
 * Usage: node scripts/report-national-discovery-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
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

const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["DC", "Washington DC"],
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

const since7 = new Date(Date.now() - 7 * 864e5);
const since30 = new Date(Date.now() - 30 * 864e5);

try {
  const cursor = await prisma.growthDiscoveryCursor.findUnique({
    where: {
      adapterId_marketSlug_cursorKey: {
        adapterId: "autonomous_web_search_venue",
        marketSlug: "national-discovery-us",
        cursorKey: "search_rotation",
      },
    },
  });

  let qi = null;
  try {
    qi = cursor?.value ? JSON.parse(cursor.value).qi : null;
  } catch {
    qi = null;
  }

  // Code rotation: 2 US-wide + 51 state names = 53 geo scopes (see usStateGeoScopes.ts)
  const geoScopeCount = 53;
  const queryCoreApprox = 40;
  const rotationSpan = queryCoreApprox * geoScopeCount;

  const verifiedByRegion = await prisma.publicOpenMicListing.groupBy({
    by: ["region"],
    where: { verificationStatus: "VERIFIED" },
    _count: true,
  });
  const needsByRegion = await prisma.publicOpenMicListing.groupBy({
    by: ["region"],
    where: { verificationStatus: "NEEDS_REVIEW" },
    _count: true,
  });
  const leadsByRegion = await prisma.growthLead.groupBy({
    by: ["region"],
    _count: true,
  });
  const leads7 = await prisma.growthLead.groupBy({
    by: ["region"],
    where: { createdAt: { gte: since7 } },
    _count: true,
  });
  const leads30 = await prisma.growthLead.groupBy({
    by: ["region"],
    where: { createdAt: { gte: since30 } },
    _count: true,
  });

  const mapCount = (rows) => Object.fromEntries(rows.map((r) => [(r.region || "").toUpperCase(), r._count]));
  const vMap = mapCount(verifiedByRegion);
  const nMap = mapCount(needsByRegion);
  const lMap = mapCount(leadsByRegion);
  const l7 = mapCount(leads7);
  const l30 = mapCount(leads30);

  const table = STATES.map(([code, name], idx) => ({
    state: name,
    stateCode: code,
    includedInRotation: true,
    rotationIndex: idx,
    // Approximate: geo advances every queryCoreApprox qi steps after US-wide buckets (0,1)
    approxCursorGeoIndex: qi == null ? null : Math.floor(Number(qi) / queryCoreApprox) % geoScopeCount,
    verifiedListings: vMap[code] ?? 0,
    needsReview: nMap[code] ?? 0,
    growthLeadsTotal: lMap[code] ?? 0,
    growthLeads7d: l7[code] ?? 0,
    growthLeads30d: l30[code] ?? 0,
  }));

  const runs7 = await prisma.growthDiscoveryRun.count({
    where: { createdAt: { gte: since7 }, markets: { has: "national-discovery-us" } },
  });
  const runs30 = await prisma.growthDiscoveryRun.count({
    where: { createdAt: { gte: since30 }, markets: { has: "national-discovery-us" } },
  });

  const outDir = path.join("tmp", "prod-baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `national-coverage-${stamp}.json`);
  const payload = {
    capturedAt: new Date().toISOString(),
    nationalMarketSlug: "national-discovery-us",
    note: "Umbrella slug national-discovery-us rotates geo tails across all 50 states + DC; the '9 discovery markets' homepage metric is location rollups with inventory, not discovery reach.",
    cursorPersisted: Boolean(cursor),
    cursorUpdatedAt: cursor?.updatedAt ?? null,
    cursorQi: qi,
    rotationSpanApprox: rotationSpan,
    statesInCodeRotation: 51,
    discoveryRuns7d: runs7,
    discoveryRuns30d: runs30,
    statesWithZeroLeads30d: table.filter((t) => t.growthLeads30d === 0).map((t) => t.stateCode),
    table,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        cursorPersisted: payload.cursorPersisted,
        cursorQi: qi,
        statesInCodeRotation: 51,
        discoveryRuns7d: runs7,
        discoveryRuns30d: runs30,
        statesWithZeroLeads30d: payload.statesWithZeroLeads30d,
        verifiedByStateNonNull: table.filter((t) => t.verifiedListings > 0).length,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
