/**
 * Restore-validate a MicStage backup into an isolated local PostgreSQL 17 instance.
 * Starts/stops a dedicated data dir on port 55432 (trust auth). Never touches production.
 *
 *   node scripts/validate-backup-restore-local.mjs 2026-08-15-1331
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const stamp = process.argv[2]?.trim();
if (!stamp) {
  console.error(JSON.stringify({ ok: false, error: "missing_stamp" }));
  process.exit(1);
}

const bin = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\17\\bin";
const backupRoot =
  process.env.MICSTAGE_BACKUP_DIR?.trim() ||
  path.join(process.env.USERPROFILE || "", "Projects", "OpenMic-private-backups");
const dataDir = path.join(backupRoot, "pg17-restore-test");
const port = process.env.MICSTAGE_RESTORE_PORT || "55432";
const dbName = "micstage_validate";

const schemaPath = path.join(backupRoot, `micstage-prod-${stamp}-schema.sql`);
const dataPath = path.join(backupRoot, `micstage-prod-${stamp}-data.sql`);
for (const f of [schemaPath, dataPath]) {
  if (!fs.existsSync(f)) {
    console.error(JSON.stringify({ ok: false, error: "missing_backup_file", file: path.basename(f) }));
    process.exit(1);
  }
}

function run(exe, args, opts = {}) {
  const r = spawnSync(path.join(bin, exe), args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  return r;
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function ensureCluster() {
  console.error(JSON.stringify({ phase: "ensure_cluster", dataDir }));
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    fs.mkdirSync(dataDir, { recursive: true });
    const init = run("initdb.exe", [
      "-D",
      dataDir,
      "-U",
      "postgres",
      "--auth-local=trust",
      "--auth-host=trust",
      "--encoding=UTF8",
      "--locale=C",
    ]);
    if (init.status !== 0) {
      throw new Error(`initdb_failed: ${(init.stderr || init.stdout || "").slice(0, 500)}`);
    }
  }
}

function isReady() {
  const r = run("pg_isready.exe", ["-h", "127.0.0.1", "-p", port]);
  return r.status === 0 && String(r.stdout || "").includes("accepting");
}

function startServer() {
  console.error(JSON.stringify({ phase: "start_server", ready: isReady() }));
  if (isReady()) return;
  run("pg_ctl.exe", ["-D", dataDir, "-o", `-p ${port}`, "-l", path.join(dataDir, "pg.log"), "start"]);
  for (let i = 0; i < 40; i++) {
    sleepMs(250);
    if (isReady()) {
      console.error(JSON.stringify({ phase: "server_ready", attempt: i }));
      return;
    }
  }
  throw new Error("server_not_ready");
}

function stopServer() {
  run("pg_ctl.exe", ["-D", dataDir, "stop", "-m", "fast"]);
}

ensureCluster();
startServer();

console.error(JSON.stringify({ phase: "recreate_db" }));
run("dropdb.exe", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "--if-exists", dbName]);
const created = run("createdb.exe", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", dbName]);
if (created.status !== 0) {
  console.error(JSON.stringify({ ok: false, error: "createdb_failed", detail: (created.stderr || "").slice(0, 400) }));
  stopServer();
  process.exit(1);
}

const schemaFixed = path.join(backupRoot, `micstage-prod-${stamp}-schema.restore.sql`);
let schemaSql = fs.readFileSync(schemaPath, "utf8");
schemaSql = schemaSql.replace(/CREATE SCHEMA "public";/g, 'CREATE SCHEMA IF NOT EXISTS "public";');
fs.writeFileSync(schemaFixed, schemaSql);

console.error(JSON.stringify({ phase: "restore_schema" }));
const schemaRestore = run("psql.exe", [
  "-h",
  "127.0.0.1",
  "-p",
  port,
  "-U",
  "postgres",
  "-d",
  dbName,
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  schemaFixed,
]);
if (schemaRestore.status !== 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "schema_restore_failed",
      detail: String(schemaRestore.stderr || schemaRestore.stdout || "").slice(0, 1500),
    }),
  );
  run("dropdb.exe", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "--if-exists", dbName]);
  try {
    fs.unlinkSync(schemaFixed);
  } catch {}
  stopServer();
  process.exit(1);
}

console.error(JSON.stringify({ phase: "restore_data", bytes: fs.statSync(dataPath).size }));
const dataRestore = run("psql.exe", [
  "-h",
  "127.0.0.1",
  "-p",
  port,
  "-U",
  "postgres",
  "-d",
  dbName,
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "SET session_replication_role = replica;",
  "-f",
  dataPath,
]);
if (dataRestore.status !== 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "data_restore_failed",
      detail: String(dataRestore.stderr || dataRestore.stdout || "").slice(0, 1500),
    }),
  );
  run("dropdb.exe", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "--if-exists", dbName]);
  try {
    fs.unlinkSync(schemaFixed);
  } catch {}
  stopServer();
  process.exit(1);
}

console.error(JSON.stringify({ phase: "count_rows" }));
const countSql = `
SELECT json_build_object(
  'listings', (SELECT count(*) FROM "PublicOpenMicListing"),
  'venues', (SELECT count(*) FROM "Venue"),
  'owners', (SELECT count(*) FROM "VenueOwner"),
  'musicians', (SELECT count(*) FROM "MusicianUser"),
  'promoters', (SELECT count(*) FROM "PromoterUser"),
  'leads', (SELECT count(*) FROM "GrowthLead"),
  'templates', (SELECT count(*) FROM "EventTemplate"),
  'tokens', (SELECT count(*) FROM "ListingClaimInviteToken"),
  'audits', (SELECT count(*) FROM "ListingClaimAuditEvent"),
  'evidence', (SELECT count(*) FROM "ListingOpenMicEvidence"),
  'runtime', (SELECT count(*) FROM "OperationalRuntimeSetting"),
  'migrations', (SELECT count(*) FROM "_prisma_migrations"),
  'schedules', (SELECT count(*) FROM "PublicOpenMicSchedule")
);
`;
const countFile = path.join(backupRoot, "count-validate.sql");
fs.writeFileSync(countFile, countSql);
const counts = run("psql.exe", [
  "-h",
  "127.0.0.1",
  "-p",
  port,
  "-U",
  "postgres",
  "-d",
  dbName,
  "-t",
  "-A",
  "-f",
  countFile,
]);

let countJson = null;
try {
  countJson = JSON.parse(String(counts.stdout || "").trim());
} catch {
  countJson = { parseError: true, raw: String(counts.stdout || "").slice(0, 200) };
}

console.error(JSON.stringify({ phase: "cleanup" }));
run("dropdb.exe", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "--if-exists", dbName]);
try {
  fs.unlinkSync(schemaFixed);
  fs.unlinkSync(countFile);
} catch {}
stopServer();

const ok =
  countJson &&
  !countJson.parseError &&
  Number(countJson.listings) > 0 &&
  Number(countJson.leads) > 0 &&
  Number(countJson.migrations) >= 29;

console.log(
  JSON.stringify(
    {
      ok,
      stamp,
      method: "isolated_local_postgres_17_port_55432",
      productionTouched: false,
      restoredThenDropped: true,
      counts: countJson,
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
