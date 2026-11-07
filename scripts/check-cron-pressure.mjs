/**
 * Regression: single-flight leases + staggered cadence + smaller per-tick floors.
 * Run: npx tsx scripts/check-cron-pressure.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { independentProcessingBudgets } from "../src/lib/growth/backlogPressure.ts";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "src/app/api/cron/growth-pipeline/route.ts"), "utf8");
const lease = fs.readFileSync(path.join(root, "src/lib/growth/cronJobLease.ts"), "utf8");
const enrichLock = fs.readFileSync(path.join(root, "src/lib/growth/enrichmentLock.ts"), "utf8");
const schedule = fs.readFileSync(
  path.join(root, "src/lib/publicListings/listingScheduleEnrichment.ts"),
  "utf8",
);

assert.match(lease, /CRON_LEASE_TICK/);
assert.match(lease, /CRON_LEASE_ENRICHMENT/);
assert.match(lease, /FOR UPDATE/);
assert.match(route, /acquireCronJobLease/);
assert.match(route, /CRON_LEASE_TICK/);
assert.match(route, /already_running/);
assert.match(route, /Sequential workers/);
assert.doesNotMatch(
  route,
  /Promise\.all\(\[\s*enrichVerifiedListingSchedules/,
  "enrichment must not Promise.all schedule+contact",
);
assert.match(enrichLock, /acquireCronJobLease/);
assert.doesNotMatch(enrichLock, /pg_try_advisory_lock/);
assert.match(schedule, /expandOfficialEvidenceUrls\(seeds, 6\)/);

const budgets = independentProcessingBudgets({
  backlogPublishPerTick: { effective: 50 },
  backlogGoogleVerifyPerTick: { effective: 30 },
  backlogPromotePerTick: { effective: 60 },
  backlogEvidenceEnrichPerTick: { effective: 30 },
  autoRejectJunkPerRun: { effective: 80 },
  verifiedContactMinePerTick: { effective: 20 },
});
assert.ok(budgets.junk <= 80, `junk floor too high: ${budgets.junk}`);
assert.ok(budgets.promote <= 60, `promote too high: ${budgets.promote}`);
assert.ok(budgets.schedule <= 20, `schedule too high: ${budgets.schedule}`);
assert.ok(budgets.mine <= 20, `mine too high: ${budgets.mine}`);

console.log(JSON.stringify({ ok: true, checks: "cron-pressure", budgets }, null, 2));
