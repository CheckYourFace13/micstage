/**
 * Convert venue/actions.ts: drop next/navigation redirect(), use portalRedirect + try/catch for VenuePortalRedirectSignal.
 * Run from repo root: node scripts/patch-venue-actions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "../src/app/venue/actions.ts");
let s = fs.readFileSync(file, "utf8");

if (!s.includes('import { redirect } from "next/navigation"')) {
  console.log("Skip: already patched");
  process.exit(0);
}

s = s.replace('import { redirect } from "next/navigation";\n', "");

const inject = `import {
  buildVenuePortalRedirect,
  portalRedirect,
  type VenuePortalActionResult,
  VenuePortalRedirectSignal,
} from "@/lib/venuePortalActionResult";
`;
s = s.replace('"use server";\n\n', `"use server";\n\n${inject}`);

s = s.replace(
  /\n\/\*\* Keep venue dashboard on the same lineup day after slot actions \(optional `lineupDay` on form\). \*\/\nfunction redirectVenueWithOptionalLineupDay\(query: string, formData: FormData\): never \{\n  const day = optString\(formData, "lineupDay"\);\n  const suffix = day && isValidLineupYmd\(day\) \? `&lineupDay=\$\{encodeURIComponent\(day\)\}` : "";\n  redirect\(`\/venue\?\$\{query\}\$\{suffix\}`\);\n\}\n\n/,
  "\n",
);

s = s.replace(
  /function reqString\(formData: FormData, key: string\): string \{\n  const v = formData\.get\(key\);\n  if \(typeof v !== "string" \|\| !v\.trim\(\)\) redirect\("\/venue\?venueError=invalidForm"\);\n  return v\.trim\(\);\n\}/,
  `function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim())
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));
  return v.trim();
}`,
);

s = s.replace(
  /if \(!Number\.isFinite\(n\)\) redirect\("\/venue\?venueError=invalidForm"\);/,
  `if (!Number.isFinite(n)) throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));`,
);

s = s.replace(
  /if \(Number\.isNaN\(d\.getTime\(\)\)\) redirect\("\/venue\?venueError=invalidForm"\);/,
  `if (Number.isNaN(d.getTime())) throw new VenuePortalRedirectSignal(portalRedirect("/venue?venueError=invalidForm"));`,
);

s = s.replace(
  /if \(typeof raw !== "string" \|\| !raw\.trim\(\)\) redirect\("\/venue\?scheduleError=invalidTime"\);/,
  `if (typeof raw !== "string" || !raw.trim())
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));`,
);
s = s.replace(
  /if \(!m\) redirect\("\/venue\?scheduleError=invalidTime"\);/,
  `if (!m) throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));`,
);
s = s.replace(
  /if \(hh < 0 \|\| hh > 23 \|\| mm < 0 \|\| mm > 59\) redirect\("\/venue\?scheduleError=invalidTime"\);/,
  `if (hh < 0 || hh > 23 || mm < 0 || mm > 59)
    throw new VenuePortalRedirectSignal(portalRedirect("/venue?scheduleError=invalidTime"));`,
);

s = s.replace(
  /redirectVenueWithOptionalLineupDay\("([^"]+)", formData\)/g,
  'return portalRedirect(buildVenuePortalRedirect("$1", formData))',
);

s = s.replace(/\bredirect\(/g, "return portalRedirect(");

const names = [
  "createEventTemplate",
  "saveWeeklyScheduleAndGenerateSlots",
  "updateVenueProfile",
  "discoverVenueSocials",
  "inviteManager",
  "houseBookSlot",
  "upgradeVenuePlan",
  "updateSlotBookingRules",
  "updateVenueSlotLine",
  "deleteVenueSlot",
  "deleteVenueOpenMicDay",
  "toggleVenuePerformerHistoryPublic",
];

const catchBlock = `
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
`;

for (const name of names) {
  const openPat = `export async function ${name}(formData: FormData) {`;
  if (!s.includes(openPat)) {
    console.error("Missing:", openPat);
    process.exit(1);
  }
  s = s.replace(
    openPat,
    `export async function ${name}(formData: FormData): Promise<VenuePortalActionResult> {
  try {`,
  );

  const openSig = `export async function ${name}(formData: FormData): Promise<VenuePortalActionResult> {
  try {`;
  const start = s.indexOf(openSig);
  if (start === -1) {
    console.error("Open sig not found", name);
    process.exit(1);
  }
  const tryOpen = s.indexOf("try {", start);
  const bodyStart = tryOpen + "try {".length;
  let depth = 1;
  let i = bodyStart;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  const closeTryIdx = i - 1;
  s = s.slice(0, closeTryIdx + 1) + catchBlock + s.slice(closeTryIdx + 1);
}

fs.writeFileSync(file, s);
console.log("OK", file);
