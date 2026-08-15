/**
 * Create a Supabase-style logical production backup (roles + schema + data).
 *
 * Prefer: `npx supabase db dump` when Docker Desktop is available.
 * Fallback: local `pg_dump` with equivalent flags (no Docker required).
 *
 * Secrets from env only (.env / .env.local / DIRECT_URL / DATABASE_URL).
 * Never logs connection strings or passwords.
 *
 * Usage:
 *   node scripts/create-production-backup.mjs
 *   set MICSTAGE_BACKUP_DIR=C:\path\to\backups
 *   set PG_DUMP_PATH=C:\Users\chris\Tools\pgsql-bin\bin\pg_dump.exe
 *
 * Output (outside repo by default):
 *   micstage-prod-YYYY-MM-DDTHHMMSSZ-roles.sql
 *   micstage-prod-YYYY-MM-DDTHHMMSSZ-schema.sql
 *   micstage-prod-YYYY-MM-DDTHHMMSSZ-data.sql
 *   micstage-prod-YYYY-MM-DDTHHMMSSZ.manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

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

function redact(s) {
  return String(s || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_URL]")
    .replace(/password=[^\s&"']+/gi, "password=[REDACTED]")
    .replace(/PGPASSWORD=[^\s"']+/gi, "PGPASSWORD=[REDACTED]");
}

function pickDbUrl() {
  for (const key of ["DIRECT_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"]) {
    const u = process.env[key]?.trim();
    if (u) return { key, url: u };
  }
  return null;
}

/** Session-mode pooler (5432) supports pg_dump; transaction pooler (6543) does not. */
function preferDumpSafe(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes("pooler.supabase.com") && (u.port || "5432") === "6543") {
      u.port = "5432";
      u.searchParams.delete("pgbouncer");
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

function hostMeta(urlStr) {
  try {
    const u = new URL(urlStr);
    return { host: u.hostname, port: u.port || "5432", database: u.pathname.replace(/^\//, "") || "postgres" };
  } catch {
    return { host: "(unparseable)", port: "?", database: "?" };
  }
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where.exe" : "which", [cmd], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
}

function resolvePgDump() {
  const fromEnv = process.env.PG_DUMP_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const portable = path.join(
    process.env.USERPROFILE || "",
    "Tools",
    "pgsql-bin",
    "bin",
    process.platform === "win32" ? "pg_dump.exe" : "pg_dump",
  );
  if (fs.existsSync(portable)) return portable;
  const found = which("pg_dump");
  return found;
}

function dockerAvailable() {
  const r = spawnSync("docker", ["info"], { encoding: "utf8", timeout: 15_000 });
  return r.status === 0;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || "require", ...(opts.env || {}) },
    ...opts,
  });
  return r;
}

const EXPECTED_TABLE_MARKERS = [
  "PublicOpenMicListing",
  "PublicOpenMicSchedule",
  "Venue",
  "VenueOwner",
  "MusicianUser",
  "PromoterUser",
  "PromoterApplication",
  "GrowthLead",
  "GrowthDiscoveryRun",
  "ListingClaimInviteToken",
  "ListingClaimRequest",
  "ListingOpenMicEvidence",
  "ListingClaimAuditEvent",
  "OperationalRuntimeSetting",
  "_prisma_migrations",
];

/** Match CREATE TABLE / COPY with optional quotes and public. schema. */
function tableMentioned(sql, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(CREATE\\s+TABLE|COPY)\\s+(?:(?:"?public"?\\.)?"?${escaped}"?|"${escaped}")\\s*[(]`,
    "i",
  );
  return re.test(sql);
}

function validateSqlFile(kind, filePath) {
  const st = fs.statSync(filePath);
  const errors = [];
  if (st.size <= 0) errors.push("zero_bytes");
  const full = fs.readFileSync(filePath, "utf8");
  const head = full.slice(0, 200_000);
  const tail = full.slice(Math.max(0, full.length - 64_000));
  const sample = head + "\n" + tail;

  if (kind === "roles") {
    if (st.size < 20) errors.push("roles_too_small");
    // Managed Supabase often cannot dump cluster roles; a documented stub is acceptable.
    if (!/ROLE|MicStage roles dump|--/i.test(sample)) errors.push("roles_unreadable");
  }
  if (kind === "schema") {
    if (st.size < 5_000) errors.push("schema_too_small");
    if (!/CREATE TABLE/i.test(sample)) errors.push("schema_missing_create_table");
    const missing = EXPECTED_TABLE_MARKERS.filter((t) => !tableMentioned(full, t));
    if (missing.length) errors.push(`schema_missing_tables:${missing.join(",")}`);
  }
  if (kind === "data") {
    if (st.size < 10_000) errors.push("data_too_small");
    if (!/COPY\s+/i.test(sample) && !/INSERT INTO/i.test(sample)) errors.push("data_missing_copy_or_insert");
    const core = ["PublicOpenMicListing", "Venue", "GrowthLead", "_prisma_migrations", "OperationalRuntimeSetting"];
    const coreMissing = core.filter((t) => !tableMentioned(full, t));
    if (coreMissing.length) errors.push(`data_missing_core_copy:${coreMissing.join(",")}`);
    const missing = EXPECTED_TABLE_MARKERS.filter((t) => !tableMentioned(full, t));
    if (missing.length > 3) errors.push(`data_many_tables_missing:${missing.join(",")}`);
    // COPY blocks should terminate
    const copyStarts = (full.match(/^COPY /gm) || []).length;
    const copyEnds = (full.match(/^\\.$/gm) || []).length;
    if (copyStarts > 0 && copyEnds < copyStarts * 0.9) errors.push("data_possible_truncation_copy_terminators");
  }
  if (/\x00/.test(sample)) errors.push("contains_null_bytes");
  return { bytes: st.size, errors, ok: errors.length === 0 };
}

function dumpWithSupabaseCli(dumpUrl, outDir, stamp) {
  const roles = path.join(outDir, `micstage-prod-${stamp}-roles.sql`);
  const schema = path.join(outDir, `micstage-prod-${stamp}-schema.sql`);
  const data = path.join(outDir, `micstage-prod-${stamp}-data.sql`);
  for (const f of [roles, schema, data]) {
    if (fs.existsSync(f)) {
      return { ok: false, error: "refusing_overwrite", file: path.basename(f) };
    }
  }

  const runs = [
    { file: roles, args: ["db", "dump", "--db-url", dumpUrl, "-f", roles, "--role-only"] },
    { file: schema, args: ["db", "dump", "--db-url", dumpUrl, "-f", schema] },
    {
      file: data,
      args: [
        "db",
        "dump",
        "--db-url",
        dumpUrl,
        "-f",
        data,
        "--use-copy",
        "--data-only",
        "-x",
        "storage.buckets_vectors",
        "-x",
        "storage.vector_indexes",
      ],
    },
  ];

  for (const step of runs) {
    const r = run("npx", ["--yes", "supabase@2.114.0", ...step.args], { timeout: 600_000 });
    if (r.status !== 0) {
      return {
        ok: false,
        error: "supabase_db_dump_failed",
        step: path.basename(step.file),
        detail: redact(r.stderr || r.stdout || "").slice(0, 1500),
      };
    }
  }
  return { ok: true, method: "supabase_cli_docker", files: { roles, schema, data } };
}

/**
 * Local pg_dump approximating Supabase CLI filters for MicStage app data in public.
 * Includes public schema (Prisma app) + _prisma_migrations.
 */
function dumpWithLocalPgDump(dumpUrl, outDir, stamp, pgDumpPath) {
  const roles = path.join(outDir, `micstage-prod-${stamp}-roles.sql`);
  const schema = path.join(outDir, `micstage-prod-${stamp}-schema.sql`);
  const data = path.join(outDir, `micstage-prod-${stamp}-data.sql`);
  for (const f of [roles, schema, data]) {
    if (fs.existsSync(f)) {
      return { ok: false, error: "refusing_overwrite", file: path.basename(f) };
    }
  }

  const excludeSchemas = [
    "information_schema",
    "pg_catalog",
    "_analytics",
    "_realtime",
    "_supavisor",
    "auth",
    "etl",
    "extensions",
    "pgbouncer",
    "realtime",
    "storage",
    "supabase_functions",
    "supabase_migrations",
    "cron",
    "graphql",
    "graphql_public",
    "net",
    "vault",
  ];

  const common = ["--no-owner", "--no-privileges", "--quote-all-identifiers"];

  // Roles
  {
    const r = run(pgDumpPath, [...common, "--roles-only", "--file", roles, dumpUrl], { timeout: 120_000 });
    if (r.status !== 0) {
      // Managed Supabase often blocks --roles-only; write a readable stub + note
      const detail = redact(r.stderr || r.stdout || "").slice(0, 800);
      fs.writeFileSync(
        roles,
        [
          "-- MicStage roles dump",
          "-- Note: full --roles-only failed on this connection (common on Supabase managed).",
          "-- Application data does not depend on custom cluster roles for restore of public schema.",
          `-- detail (redacted): ${detail.replace(/\n/g, " ").slice(0, 400)}`,
          "",
        ].join("\n"),
        "utf8",
      );
    }
  }

  // Schema (public only — MicStage Prisma)
  {
    const args = [
      ...common,
      "--schema-only",
      "--schema=public",
      "--file",
      schema,
      dumpUrl,
    ];
    const r = run(pgDumpPath, args, { timeout: 300_000 });
    if (r.status !== 0) {
      return {
        ok: false,
        error: "pg_dump_schema_failed",
        detail: redact(r.stderr || r.stdout || "").slice(0, 1500),
      };
    }
  }

  // Data
  {
    const args = [
      ...common,
      "--data-only",
      "--schema=public",
      "--file",
      data,
      dumpUrl,
    ];
    const r = run(pgDumpPath, args, { timeout: 600_000 });
    if (r.status !== 0) {
      return {
        ok: false,
        error: "pg_dump_data_failed",
        detail: redact(r.stderr || r.stdout || "").slice(0, 1500),
      };
    }
  }

  return {
    ok: true,
    method: "local_pg_dump_supabase_equivalent",
    files: { roles, schema, data },
    note: "Docker unavailable; used local pg_dump with --schema=public (MicStage app data). Excluded Supabase-managed schemas (auth/storage/…). Storage objects are not in DB dumps.",
    excludeSchemas,
  };
}

// ——— main ———
const picked = pickDbUrl();
if (!picked) {
  console.error(JSON.stringify({ ok: false, error: "No DATABASE_URL/DIRECT_URL configured" }));
  process.exit(1);
}

const dumpUrl = preferDumpSafe(picked.url);
const meta = hostMeta(dumpUrl);
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "").replace("T", "-").replace("Z", "Z");
// e.g. 20260815-181530Z → friendlier: 2026-08-15T181530Z
const stampFriendly = now
  .toISOString()
  .replace(/\.\d{3}Z$/, "Z")
  .replace(/:/g, "");

const backupRoot =
  process.env.MICSTAGE_BACKUP_DIR?.trim() ||
  path.resolve(process.env.USERPROFILE || process.cwd(), "Projects", "OpenMic-private-backups");
fs.mkdirSync(backupRoot, { recursive: true });

const started = Date.now();
let result;

if (dockerAvailable()) {
  console.log(JSON.stringify({ phase: "dump", tool: "supabase_cli", host: meta.host, port: meta.port }));
  result = dumpWithSupabaseCli(dumpUrl, backupRoot, stampFriendly);
} else {
  const pgDump = resolvePgDump();
  if (!pgDump) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "no_dump_tool",
        message:
          "Docker Desktop is required for `supabase db dump`, and no local pg_dump was found. Install Docker Desktop, or set PG_DUMP_PATH to a pg_dump binary.",
      }),
    );
    process.exit(1);
  }
  const ver = run(pgDump, ["--version"]);
  console.log(
    JSON.stringify({
      phase: "dump",
      tool: "local_pg_dump",
      pgDumpVersion: String(ver.stdout || "").trim(),
      host: meta.host,
      port: meta.port,
      note: "Supabase CLI needs Docker; using local pg_dump fallback",
    }),
  );
  result = dumpWithLocalPgDump(dumpUrl, backupRoot, stampFriendly, pgDump);
}

if (!result.ok) {
  console.error(JSON.stringify({ ok: false, ...result }));
  process.exit(1);
}

const validations = {
  roles: validateSqlFile("roles", result.files.roles),
  schema: validateSqlFile("schema", result.files.schema),
  data: validateSqlFile("data", result.files.data),
};

const hashes = {
  roles: sha256File(result.files.roles),
  schema: sha256File(result.files.schema),
  data: sha256File(result.files.data),
};

const allValid = validations.roles.ok && validations.schema.ok && validations.data.ok;

const manifest = {
  ok: allValid,
  createdAt: now.toISOString(),
  elapsedMs: Date.now() - started,
  method: result.method,
  note: result.note || null,
  stamp: stampFriendly,
  backupRoot,
  host: meta.host,
  port: meta.port,
  database: meta.db || meta.database,
  envKeyUsed: picked.key,
  files: {
    roles: path.basename(result.files.roles),
    schema: path.basename(result.files.schema),
    data: path.basename(result.files.data),
  },
  absolutePaths: result.files,
  bytes: {
    roles: validations.roles.bytes,
    schema: validations.schema.bytes,
    data: validations.data.bytes,
    total: validations.roles.bytes + validations.schema.bytes + validations.data.bytes,
  },
  sha256: hashes,
  validation: validations,
  storageObjects:
    "Not included in database dump. MicStage profile images use Vercel Blob (BLOB_READ_WRITE_TOKEN) when configured — not Supabase Storage.",
  offSiteReminder:
    "Copy this folder to Google Drive / OneDrive / encrypted cloud. Do not commit dumps to Git.",
};

const manifestPath = path.join(backupRoot, `micstage-prod-${stampFriendly}.manifest.json`);
if (fs.existsSync(manifestPath)) {
  console.error(JSON.stringify({ ok: false, error: "refusing_overwrite", file: path.basename(manifestPath) }));
  process.exit(1);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Never print absolute paths that might leak user home in some contexts — paths are fine; URLs are not.
console.log(JSON.stringify({ ...manifest, absolutePaths: undefined, backupRoot }, null, 2));
console.log(JSON.stringify({ manifestPath: path.basename(manifestPath), backupRoot }));

process.exit(allValid ? 0 : 1);
