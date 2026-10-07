/**
 * Static checks for Amazon Associates (Open Mic Gear) wiring.
 * Run: node scripts/check-amazon-associates.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AMAZON_ASSOCIATES_TRACKING_ID,
  OPEN_MIC_GEAR_ITEMS,
  amazonSearchUrl,
} from "../src/lib/amazonAssociates.ts";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

assert.equal(AMAZON_ASSOCIATES_TRACKING_ID, "micstage-20");
assert.equal(OPEN_MIC_GEAR_ITEMS.length, 12);

for (const item of OPEN_MIC_GEAR_ITEMS) {
  const url = amazonSearchUrl(item.searchKeywords);
  assert.match(url, /^https:\/\/www\.amazon\.com\/s\?/);
  assert.match(url, /tag=micstage-20/);
  assert.doesNotMatch(url, /tag=(?!micstage-20)\w+/);
  assert.ok(item.guidance.length > 40, `guidance too short: ${item.category}`);
  assert.doesNotMatch(item.guidance, /\$\d/, `no prices in guidance: ${item.category}`);
}

const page = read("src/app/resources/open-mic-gear/page.tsx");
assert.match(page, /Affiliate disclosure: MicStage may earn a commission from qualifying purchases\./);
assert.match(page, /As an Amazon Associate I earn from qualifying purchases\./);
assert.match(page, /AmazonAffiliateLink/);
assert.doesNotMatch(page, /images-na\.ssl-images-amazon|media-amazon\.com/);

const linkComponent = read("src/components/resources/AmazonAffiliateLink.tsx");
assert.match(linkComponent, /affiliate_click/);
assert.match(linkComponent, /affiliate_network/);
assert.match(linkComponent, /tracking_id/);
assert.match(linkComponent, /destination/);
assert.match(linkComponent, /rel="noopener noreferrer sponsored"/);
assert.match(linkComponent, /target="_blank"/);

const marketing = read("src/lib/marketingTracking.ts");
assert.match(marketing, /"affiliate_click"/);

const footer = read("src/components/SiteFooter.tsx");
assert.match(footer, /\/resources\/open-mic-gear/);
assert.match(footer, /Open Mic Gear/);

const resourcesIndex = read("src/app/resources/page.tsx");
assert.match(resourcesIndex, /\/resources\/open-mic-gear/);

const sitemap = read("src/app/sitemap.ts");
assert.match(sitemap, /\/resources\/open-mic-gear/);

const associatesLib = read("src/lib/amazonAssociates.ts");
assert.match(associatesLib, /AMAZON_ASSOCIATES_TRACKING_ID = "micstage-20"/);
// Re-check: Associates store ID / tag values in src are only micstage-20
const srcRoot = path.join(root, "src");
/** @type {string[]} */
const offenders = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const m of text.matchAll(/tag=([a-z0-9-]+)/gi)) {
      if (m[1] !== "micstage-20") offenders.push(`${path.relative(root, full)}: tag=${m[1]}`);
    }
    for (const m of text.matchAll(/AMAZON_ASSOCIATES_TRACKING_ID\s*=\s*"([^"]+)"/g)) {
      if (m[1] !== "micstage-20") offenders.push(`${path.relative(root, full)}: id=${m[1]}`);
    }
  }
}
walk(srcRoot);
assert.equal(offenders.length, 0, `unexpected Amazon tracking IDs:\n${offenders.join("\n")}`);

// Operational flows must not gain shopping CTAs
for (const rel of [
  "src/app/page.tsx",
  "src/app/register/venue/page.tsx",
  "src/app/register/musician/page.tsx",
  "src/app/register/promoter/page.tsx",
  "src/app/host/page.tsx",
]) {
  const text = read(rel);
  assert.doesNotMatch(text, /open-mic-gear|amazon\.com\/s\?|micstage-20/, `no affiliate CTA in ${rel}`);
}

console.log(`ok: amazon associates (${OPEN_MIC_GEAR_ITEMS.length} links, tag=${AMAZON_ASSOCIATES_TRACKING_ID})`);
