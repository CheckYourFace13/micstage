/**
 * Places cost ceiling + single-gateway regressions.
 *   npm run test:places-cost
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DETAILS_PRO_FIELD_MASK,
  IDS_ONLY_FIELD_MASK,
  LIMITS,
  placesDetailsPro,
  placesTextSearchIdsOnly,
} from "../src/lib/places/placesGateway.ts";

function memoryPrisma() {
  const rows = new Map();
  let fetches = 0;
  const prisma = {
    fetches: () => fetches,
    placesUsageLedger: {
      create: async ({ data }) => {
        if (rows.has(data.idempotencyKey)) throw new Error("unique");
        rows.set(data.idempotencyKey, { ...data, placeId: data.placeId ?? null, responseClass: null });
        return data;
      },
      findUnique: async ({ where }) => rows.get(where.idempotencyKey) ?? null,
      count: async ({ where }) =>
        [...rows.values()].filter((r) => {
          if (where.sent != null && r.sent !== where.sent) return false;
          if (where.sku && r.sku !== where.sku) return false;
          if (where.dayUtc && r.dayUtc !== where.dayUtc) return false;
          if (where.monthUtc && r.monthUtc !== where.monthUtc) return false;
          return true;
        }).length,
      aggregate: async () => ({
        _sum: {
          estimatedUsdMicros: [...rows.values()].reduce(
            (n, r) => n + (r.sent ? r.estimatedUsdMicros || 0 : 0),
            0,
          ),
        },
      }),
    },
    bumpFetches() {
      fetches += 1;
    },
  };
  return prisma;
}

process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-key";
delete process.env.GOOGLE_PLACES_API_KEY;

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    return { ok: true, json: async () => ({ places: [{ id: "pid-1" }] }) };
  };
  const a = await placesTextSearchIdsOnly(prisma, { query: "Fox and Hounds, Chicago, IL", purpose: "test", fetchImpl });
  const b = await placesTextSearchIdsOnly(prisma, { query: "Fox and Hounds, Chicago, IL", purpose: "test", fetchImpl });
  assert.equal(a.sent, true);
  assert.equal(a.placeId, "pid-1");
  assert.equal(b.deduped, true);
  assert.equal(outbound, 1);
}

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    return { ok: true, json: async () => ({ id: "pid-shared" }) };
  };
  await placesDetailsPro(prisma, { placeId: "pid-shared", purpose: "alias-a", fetchImpl });
  const second = await placesDetailsPro(prisma, { placeId: "pid-shared", purpose: "alias-b", fetchImpl });
  assert.equal(second.deduped, true);
  assert.equal(outbound, 1);
}

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, json: async () => ({ places: [{ id: "pid-race" }] }) };
  };
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      placesTextSearchIdsOnly(prisma, { query: "Same Venue, Austin, TX", purpose: "race", fetchImpl }),
    ),
  );
  assert.equal(outbound, 1);
  assert.equal(results.filter((r) => r.placeId === "pid-race" || r.deduped).length, 20);
}

assert.equal(IDS_ONLY_FIELD_MASK, "places.id");
assert.equal(DETAILS_PRO_FIELD_MASK.includes("*"), false);
assert.equal(DETAILS_PRO_FIELD_MASK.includes("websiteUri"), false);
assert.equal(LIMITS.detailsEnterprisePerMonth, 0);
assert.equal(LIMITS.hardCeilingUsd, 30);
assert.equal(LIMITS.softTargetUsd, 20);
assert.equal(LIMITS.detailsProPerDay, 20);
assert.equal(LIMITS.detailsProPerMonth, 600);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "generated") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) acc.push(full);
  }
  return acc;
}

const files = walk("src");
const offenders = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes("/maps/api/place/textsearch") || text.includes("/maps/api/place/details")) {
    offenders.push(file);
  }
  if (text.includes("places.googleapis.com") && !file.replaceAll("\\", "/").endsWith("src/lib/places/placesGateway.ts")) {
    offenders.push("direct-new:" + file);
  }
  if (file.replaceAll("\\", "/").includes("src/") && text.includes("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") && text.includes("googleMapsServerApiKey")) {
    offenders.push("public-key:" + file);
  }
}
assert.deepEqual(offenders, []);

const verify = readFileSync("src/lib/publicListings/googlePlacesVerify.ts", "utf8");
assert.match(verify, /allowPaidDetails/);
assert.match(verify, /PLACES_ENRICH_MIN_VERIFIED_INVENTORY/);
assert.match(verify, /24 \* 30/);
const cron = readFileSync("src/app/api/cron/growth-pipeline/route.ts", "utf8");
assert.match(cron, /skipDownstream: true/);

console.log(JSON.stringify({ ok: true, checks: "places-cost" }));
