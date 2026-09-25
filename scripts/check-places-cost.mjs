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
import { shouldStampPlaceVerifiedAt } from "../src/lib/publicListings/googlePlacesVerify.ts";

function memoryPrisma() {
  const rows = new Map();
  const prisma = {
    rows,
    placesUsageLedger: {
      create: async ({ data }) => {
        if (rows.has(data.idempotencyKey)) throw new Error("unique");
        rows.set(data.idempotencyKey, { ...data, placeId: data.placeId ?? null, retryAfter: data.retryAfter ?? null });
        return data;
      },
      update: async ({ where, data }) => {
        const row = rows.get(where.idempotencyKey);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
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

assert.equal(shouldStampPlaceVerifiedAt({ outcome: "needs_review" }), false);
assert.equal(shouldStampPlaceVerifiedAt({ outcome: "verified" }), true);
const promote = readFileSync("src/lib/publicListings/promotePlaceConfirmedListings.ts", "utf8");
assert.match(promote, /googlePlaceVerifiedAt:\s*\{\s*not:\s*null\s*\}/);

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    return { ok: true, status: 200, json: async () => ({ places: [{ id: "stored-id" }] }) };
  };
  await placesTextSearchIdsOnly(prisma, { query: "Restart Cafe, Austin, TX", purpose: "t", fetchImpl });
  const again = await placesTextSearchIdsOnly(prisma, { query: "Restart Cafe, Austin, TX", purpose: "t", fetchImpl });
  assert.equal(again.placeId, "stored-id");
  assert.equal(again.deduped, true);
  assert.equal(outbound, 1);
  const row = [...prisma.rows.values()].find((r) => r.placeId === "stored-id");
  assert.equal(row.responseClass, "success");
}

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    return { ok: true, status: 200, json: async () => ({ places: [] }) };
  };
  await placesTextSearchIdsOnly(prisma, { query: "Missing Venue, Austin, TX", purpose: "z", fetchImpl });
  await placesTextSearchIdsOnly(prisma, { query: "Missing Venue, Austin, TX", purpose: "z", fetchImpl });
  assert.equal(outbound, 1);
  const row = [...prisma.rows.values()][0];
  assert.equal(row.responseClass, "zero_results");
  assert.ok(row.retryAfter.getTime() > Date.now() + 20 * 24 * 3600 * 1000);
}

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    if (outbound === 1) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ places: [{ id: "after-retry" }] }) };
  };
  const first = await placesTextSearchIdsOnly(prisma, { query: "Flaky Venue, Austin, TX", purpose: "f", fetchImpl });
  assert.equal(first.blockedReason, "http_503");
  await placesTextSearchIdsOnly(prisma, { query: "Flaky Venue, Austin, TX", purpose: "f", fetchImpl });
  assert.equal(outbound, 1);
  const row = [...prisma.rows.values()][0];
  row.retryAfter = new Date(Date.now() - 1000);
  const retried = await placesTextSearchIdsOnly(prisma, { query: "Flaky Venue, Austin, TX", purpose: "f", fetchImpl });
  assert.equal(outbound, 2);
  assert.equal(retried.placeId, "after-retry");
}

{
  const prisma = memoryPrisma();
  let outbound = 0;
  const fetchImpl = async (url) => {
    outbound += 1;
    return { ok: true, status: 200, json: async () => ({ id: "details-only" }) };
  };
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      placesDetailsPro(prisma, { placeId: `daily-cap-${i}`, purpose: "cap", fetchImpl }),
    ),
  );
  assert.equal(outbound, LIMITS.detailsProPerDay);
}

{
  const prisma = memoryPrisma();
  const month = new Date().toISOString().slice(0, 7);
  for (let i = 0; i < 5000; i += 1) {
    prisma.rows.set(`seed-${i}`, {
      idempotencyKey: `seed-${i}`,
      sent: true,
      sku: "DETAILS_PRO",
      dayUtc: "1999-01-01",
      monthUtc: month,
      estimatedUsdMicros: i === 0 ? 29_990_000 : 0,
      responseClass: "success",
      placeId: `seedp-${i}`,
      retryAfter: null,
      blockedReason: null,
    });
  }
  let outbound = 0;
  const fetchImpl = async () => {
    outbound += 1;
    return { ok: true, status: 200, json: async () => ({ id: "should-not" }) };
  };
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      placesDetailsPro(prisma, { placeId: `ceiling-${i}`, purpose: "ceil", fetchImpl }),
    ),
  );
  assert.equal(outbound, 0);
  const spent = [...prisma.rows.values()].reduce((n, r) => n + (r.sent ? r.estimatedUsdMicros || 0 : 0), 0);
  assert.ok(spent / 1_000_000 <= 30);
}

console.log(JSON.stringify({ ok: true, checks: "places-cost" }));
