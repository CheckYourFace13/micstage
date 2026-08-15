/**
 * Re-validate an existing MicStage backup set (no production contact).
 * Usage: node scripts/validate-production-backup.mjs [stamp]
 * Example: node scripts/validate-production-backup.mjs 2026-08-15T181632Z
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const backupRoot =
  process.env.MICSTAGE_BACKUP_DIR?.trim() ||
  path.resolve(process.env.USERPROFILE || process.cwd(), "Projects", "OpenMic-private-backups");

const stamp = process.argv[2]?.trim();
if (!stamp) {
  const manifests = fs
    .readdirSync(backupRoot)
    .filter((f) => f.startsWith("micstage-prod-") && f.endsWith(".manifest.json"))
    .sort()
    .reverse();
  if (!manifests.length) {
    console.error(JSON.stringify({ ok: false, error: "no_manifests", backupRoot }));
    process.exit(1);
  }
  // use latest
  const m = JSON.parse(fs.readFileSync(path.join(backupRoot, manifests[0]), "utf8"));
  console.log(JSON.stringify({ using: manifests[0], stamp: m.stamp }));
  process.argv[2] = m.stamp;
}

const useStamp = process.argv[2];
const files = {
  roles: path.join(backupRoot, `micstage-prod-${useStamp}-roles.sql`),
  schema: path.join(backupRoot, `micstage-prod-${useStamp}-schema.sql`),
  data: path.join(backupRoot, `micstage-prod-${useStamp}-data.sql`),
};

// Import validation by re-running create script's logic inline (duplicated lightly)
const EXPECTED = [
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

function tableMentioned(sql, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(CREATE\\s+TABLE|COPY)\\s+(?:(?:"?public"?\\.)?"?${escaped}"?|"${escaped}")\\s*[(]`,
    "i",
  ).test(sql);
}

function sha256(p) {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

const out = { ok: true, stamp: useStamp, backupRoot, files: {}, validation: {} };
for (const [kind, fp] of Object.entries(files)) {
  if (!fs.existsSync(fp)) {
    out.ok = false;
    out.validation[kind] = { ok: false, errors: ["missing_file"] };
    continue;
  }
  const st = fs.statSync(fp);
  const sql = fs.readFileSync(fp, "utf8");
  const errors = [];
  if (st.size <= 0) errors.push("zero_bytes");
  if (kind === "schema") {
    const missing = EXPECTED.filter((t) => !tableMentioned(sql, t));
    if (missing.length) errors.push(`missing:${missing.join(",")}`);
  }
  if (kind === "data") {
    const missing = EXPECTED.filter((t) => !tableMentioned(sql, t));
    if (missing.length) errors.push(`missing:${missing.join(",")}`);
    const starts = (sql.match(/^COPY /gm) || []).length;
    const ends = (sql.match(/^\\.$/gm) || []).length;
    if (starts && ends < starts * 0.9) errors.push("truncation_risk");
    out.copyBlocks = { starts, ends };
  }
  out.files[kind] = { name: path.basename(fp), bytes: st.size, sha256: sha256(fp) };
  out.validation[kind] = { ok: errors.length === 0, errors };
  if (errors.length) out.ok = false;
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
