/**
 * Apply discovery execution guard migration to production (idempotent SQL).
 * Usage: node scripts/apply-discovery-guard-migration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(JSON.stringify({ ok: false, error: "no_database_url" }));
  process.exit(1);
}

const sqlPath = path.join(
  process.cwd(),
  "prisma/migrations/20260806200000_discovery_execution_guard/migration.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");
const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query(sql);
  const r = await client.query(
    'SELECT id, "lastCompletedHourBucket", "lastCompletedRunId" FROM "DiscoveryExecutionGuard"',
  );
  console.log(JSON.stringify({ ok: true, rows: r.rows }, null, 2));
} finally {
  client.release();
  await pool.end();
}
