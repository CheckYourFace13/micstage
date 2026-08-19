/**
 * Fail if public MicStage application tables lack RLS or anon can read/write them.
 * Run: npm run test:database-security
 *
 * Optional: node scripts/check-database-security.mjs --set-gate-clear
 *   (after live checks pass — sets DATABASE_RLS_SECURITY_GATE=clear in production)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import {
  DATABASE_RLS_SECURITY_GATE_KEY,
  MICSTAGE_APPLICATION_PUBLIC_TABLES,
  SUPABASE_ADVISOR_FLAGGED_TABLES,
} from "../src/lib/database/databaseRlsSecurity.ts";

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

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const ANON_SENSITIVE_TABLES = [
  "OperationalRuntimeSetting",
  "ListingClaimInviteToken",
  "PromoterApplicationReviewToken",
  "MarketingOutreachClick",
];

try {
  const { rows: rlsRows } = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY($1::text[])
    ORDER BY c.relname
  `, [MICSTAGE_APPLICATION_PUBLIC_TABLES]);

  const rlsMap = new Map(rlsRows.map((r) => [r.table_name, r.rls_enabled === true]));
  const missingTables = [];
  const rlsDisabled = [];

  for (const table of MICSTAGE_APPLICATION_PUBLIC_TABLES) {
    if (!rlsMap.has(table)) {
      missingTables.push(table);
      continue;
    }
    if (!rlsMap.get(table)) rlsDisabled.push(table);
  }

  assert.equal(missingTables.length, 0, `expected tables missing from public schema: ${missingTables.join(", ")}`);
  assert.equal(rlsDisabled.length, 0, `RLS disabled on: ${rlsDisabled.join(", ")}`);

  for (const table of SUPABASE_ADVISOR_FLAGGED_TABLES) {
    assert.equal(rlsMap.get(table), true, `advisor-flagged table must have RLS: ${table}`);
  }

  const anonResults = [];
  for (const table of ANON_SENSITIVE_TABLES) {
    if (!rlsMap.has(table)) continue;
    const outcomes = { table, select: null, insert: null };
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE anon");
      try {
        await client.query(`SELECT 1 FROM public."${table}" LIMIT 1`);
        outcomes.select = "allowed";
      } catch (e) {
        outcomes.select = e.code === "42501" ? "denied" : `error:${e.code}`;
      }
      try {
        await client.query(
          `INSERT INTO public."${table}" DEFAULT VALUES`,
        );
        outcomes.insert = "allowed";
      } catch (e) {
        outcomes.insert =
          e.code === "42501" || e.code === "42P01" || e.message.includes("permission denied")
            ? "denied"
            : e.code === "23502"
              ? "denied_not_null"
              : `error:${e.code}`;
      }
      anonResults.push(outcomes);
    } finally {
      await client.query("ROLLBACK");
    }
    assert.notEqual(outcomes.select, "allowed", `${table}: anon SELECT must not succeed`);
    assert.notEqual(outcomes.insert, "allowed", `${table}: anon INSERT must not succeed`);
  }

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
      tablesChecked: MICSTAGE_APPLICATION_PUBLIC_TABLES.length,
      advisorFlaggedChecked: SUPABASE_ADVISOR_FLAGGED_TABLES.length,
      rlsDisabledCount: 0,
      anonAccessTests: anonResults,
      securityGate: gateValue,
      gateClearSet: setGateClear,
    }),
  );
} finally {
  client.release();
  await pool.end();
}
