/**
 * Fail if public MicStage application tables lack RLS or anon/authenticated can read/write them.
 * Run: npm run test:database-security
 *
 * Discovers all ordinary public tables dynamically (not a fixed count).
 * Optional: node scripts/check-database-security.mjs --set-gate-clear
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import {
  DATABASE_RLS_SECURITY_GATE_KEY,
  MICSTAGE_APPLICATION_PUBLIC_TABLES,
  SUPABASE_ADVISOR_FLAGGED_TABLES,
} from "../src/lib/database/databaseRlsSecurity.ts";
import {
  filterDiscoveredPublicAppTables,
  tablesMissingRls,
} from "../src/lib/database/discoverPublicAppTables.ts";

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

const setGateClear = process.argv.includes("--set-gate-clear");
const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(JSON.stringify({ ok: false, error: "missing_DATABASE_URL_or_DIRECT_URL" }));
  process.exit(1);
}

// Regression: a newly-created table without RLS must fail the check.
const regressionSynthetic = filterDiscoveredPublicAppTables([
  { table_name: "HostNightVenueDispute", rls_enabled: false },
  { table_name: "Venue", rls_enabled: true },
]);
assert.deepEqual(tablesMissingRls(regressionSynthetic), ["HostNightVenueDispute"]);

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const ANON_SENSITIVE_TABLES = [
  "OperationalRuntimeSetting",
  "ListingClaimInviteToken",
  "PromoterApplicationReviewToken",
  "MarketingOutreachClick",
  "HostNightVenueDispute",
];

async function roleAccessOutcomes(table, role, fullCrud = false) {
  const outcomes = { table, role, select: null, insert: null, update: null, delete: null };
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    try {
      await client.query(`SELECT 1 FROM public."${table}" LIMIT 1`);
      outcomes.select = "allowed";
    } catch (e) {
      outcomes.select = e.code === "42501" ? "denied" : `error:${e.code}`;
    }
    try {
      await client.query(`INSERT INTO public."${table}" DEFAULT VALUES`);
      outcomes.insert = "allowed";
    } catch (e) {
      outcomes.insert =
        e.code === "42501" || e.code === "42P01" || e.message.includes("permission denied")
          ? "denied"
          : e.code === "23502"
            ? "denied_not_null"
            : `error:${e.code}`;
    }
    if (fullCrud) {
      try {
        await client.query(`UPDATE public."${table}" SET "updatedAt" = CURRENT_TIMESTAMP WHERE false`);
        outcomes.update = "allowed";
      } catch (e) {
        outcomes.update =
          e.code === "42501" || e.message.includes("permission denied") ? "denied" : `error:${e.code}`;
      }
      try {
        await client.query(`DELETE FROM public."${table}" WHERE false`);
        outcomes.delete = "allowed";
      } catch (e) {
        outcomes.delete =
          e.code === "42501" || e.message.includes("permission denied") ? "denied" : `error:${e.code}`;
      }
    }
  } finally {
    await client.query("ROLLBACK");
  }
  return outcomes;
}

try {
  const { rows: discoveredRows } = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  const discovered = filterDiscoveredPublicAppTables(
    discoveredRows.map((r) => ({ table_name: r.table_name, rls_enabled: r.rls_enabled === true })),
  );
  const rlsMap = new Map(discovered.map((t) => [t.name, t.rlsEnabled]));
  const rlsDisabled = tablesMissingRls(discovered);

  assert.equal(rlsDisabled.length, 0, `RLS disabled on: ${rlsDisabled.join(", ")}`);

  const discoveredNames = new Set(discovered.map((t) => t.name));
  const staticMissingFromDb = MICSTAGE_APPLICATION_PUBLIC_TABLES.filter((t) => !discoveredNames.has(t));
  assert.equal(
    staticMissingFromDb.length,
    0,
    `static table list references missing tables: ${staticMissingFromDb.join(", ")}`,
  );

  for (const table of SUPABASE_ADVISOR_FLAGGED_TABLES) {
    assert.equal(rlsMap.get(table), true, `advisor-flagged table must have RLS: ${table}`);
  }

  const accessResults = [];
  for (const table of ANON_SENSITIVE_TABLES) {
    if (!rlsMap.has(table)) continue;
    const fullCrud = table === "HostNightVenueDispute";
    for (const role of ["anon", "authenticated"]) {
      const outcomes = await roleAccessOutcomes(table, role, fullCrud);
      accessResults.push(outcomes);
      assert.notEqual(outcomes.select, "allowed", `${table}/${role}: SELECT must not succeed`);
      assert.notEqual(outcomes.insert, "allowed", `${table}/${role}: INSERT must not succeed`);
      if (fullCrud) {
        assert.notEqual(outcomes.update, "allowed", `${table}/${role}: UPDATE must not succeed`);
        assert.notEqual(outcomes.delete, "allowed", `${table}/${role}: DELETE must not succeed`);
      }
    }
  }

  const rlsDisabledInPublic = discoveredRows.filter(
    (r) => r.table_name !== "_prisma_migrations" && r.rls_enabled !== true,
  );

  if (setGateClear) {
    await client.query(
      `INSERT INTO "OperationalRuntimeSetting" ("id", "createdAt", "updatedAt", "key", "valueType", "value", "updatedBy", "reason")
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, 'string', 'clear', 'check-database-security', 'Security Advisor + anon-access checks passed')
       ON CONFLICT ("key") DO UPDATE SET "value" = 'clear', "updatedBy" = 'check-database-security', "reason" = EXCLUDED."reason", "updatedAt" = CURRENT_TIMESTAMP`,
      ["clrlsgate00000000000000001", DATABASE_RLS_SECURITY_GATE_KEY],
    );
  }

  const { rows: gateRows } = await client.query(
    `SELECT "value" FROM "OperationalRuntimeSetting" WHERE "key" = $1 LIMIT 1`,
    [DATABASE_RLS_SECURITY_GATE_KEY],
  );
  const gateValue = gateRows[0]?.value ?? null;

  console.log(
    JSON.stringify({
      ok: true,
      checks: "database-security",
      discoveryMode: "dynamic",
      tablesChecked: discovered.length,
      tablesDiscovered: discovered.map((t) => t.name),
      rlsDisabledCount: 0,
      rlsDisabledInPublicCount: rlsDisabledInPublic.length,
      regressionSyntheticPass: true,
      accessTests: accessResults,
      securityGate: gateValue,
      gateClearSet: setGateClear,
    }),
  );
} finally {
  client.release();
  await pool.end();
}
