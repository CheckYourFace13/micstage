/**
 * Create a full logical production dump via pg_dump (custom format).
 * Reads DIRECT_URL/DATABASE_URL from env files — never prints the URL or password.
 *
 * Usage: node scripts/create-production-logical-backup.mjs
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

function pickDbUrl() {
  const candidates = [
    process.env.DIRECT_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ];
  for (const raw of candidates) {
    const u = raw?.trim();
    if (!u) continue;
    // Prefer non-pooler / direct when available
    return u;
  }
  return null;
}

function hostId(urlStr) {
  try {
    const u = new URL(urlStr);
    return { host: u.hostname, port: u.port || "5432", db: u.pathname.replace(/^\//, "") || "postgres" };
  } catch {
    return { host: "(unparseable)", port: "?", db: "?" };
  }
}

/**
 * Prefer a dump-safe connection.
 * - Session-mode pooler (port 5432) works with pg_dump and often has IPv4.
 * - Transaction-mode pooler (port 6543) does NOT support pg_dump — rewrite to
 *   direct db.* host or session port 5432.
 * - Direct db.* may be IPv6-only on some networks; keep pooler session when available.
 */
function preferDumpSafe(urlStr) {
  try {
    const u = new URL(urlStr);
    const port = u.port || "5432";
    if (u.hostname.includes("pooler.supabase.com") && port === "6543") {
      // Session mode on same pooler host
      u.port = "5432";
      u.searchParams.delete("pgbouncer");
      return u.toString();
    }
    // Already session pooler or direct — use as-is
    return urlStr;
  } catch {
    return urlStr;
  }
}

const rawUrl = pickDbUrl();
if (!rawUrl) {
  console.error(JSON.stringify({ ok: false, error: "No DATABASE_URL/DIRECT_URL configured" }));
  process.exit(1);
}

const dumpUrl = preferDumpSafe(rawUrl);
const meta = hostId(dumpUrl);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/T/, "-").slice(0, 19);
const backupRoot = path.resolve("C:/Users/chris/Projects/OpenMic-private-backups");
fs.mkdirSync(backupRoot, { recursive: true });
const filename = `micstage-production-${stamp}.dump`;
const filePath = path.join(backupRoot, filename);

const pgDump = process.env.PG_DUMP_PATH?.trim() || "pg_dump";

console.log(
  JSON.stringify({
    phase: "starting_dump",
    tool: pgDump,
    format: "custom",
    host: meta.host,
    port: meta.port,
    database: meta.db,
    file: filename,
    note: "connection string not logged",
  }),
);

const args = [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  filePath,
  dumpUrl,
];

const started = Date.now();
const result = spawnSync(pgDump, args, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || "require" },
});

if (result.status !== 0) {
  // Do not echo stderr if it may contain connection string; sanitize
  const err = String(result.stderr || result.stdout || "pg_dump failed")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_URL]")
    .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
    .slice(0, 2000);
  console.error(JSON.stringify({ ok: false, error: "pg_dump_failed", exitCode: result.status, detail: err }));
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(JSON.stringify({ ok: false, error: "dump_file_missing" }));
  process.exit(1);
}

const st = fs.statSync(filePath);
if (st.size < 10_000) {
  console.error(JSON.stringify({ ok: false, error: "dump_too_small", bytes: st.size }));
  process.exit(1);
}

const hash = createHash("sha256");
hash.update(fs.readFileSync(filePath));
const sha256 = hash.digest("hex");

// pg_dump version
const ver = spawnSync(pgDump, ["--version"], { encoding: "utf8" });
const pgDumpVersion = String(ver.stdout || "").trim();

const manifest = {
  ok: true,
  createdAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  filename,
  absolutePath: filePath,
  bytes: st.size,
  sha256,
  pgDumpVersion,
  host: meta.host,
  port: meta.port,
  database: meta.db,
  format: "custom",
  flags: ["--no-owner", "--no-privileges"],
  projectRef: "ztaijzplgjbqnsqhplud",
  region: "us-east-1",
};

fs.writeFileSync(path.join(backupRoot, `${filename}.manifest.json`), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
