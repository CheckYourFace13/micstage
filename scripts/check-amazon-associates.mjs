/**
 * Static checks for Amazon Associates (Open Mic Gear) wiring + placement guardrails.
 * Run: npx tsx scripts/check-amazon-associates.mjs
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

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

/** Markers that must never appear outside allowlisted affiliate/editorial surfaces. */
const AFFILIATE_MARKERS = [
  { name: "amazon_search_url", re: /amazon\.com\/s\?/i },
  { name: "amazon_tag", re: /tag=micstage-20/i },
  { name: "tracking_id_literal", re: /\bmicstage-20\b/ },
  { name: "affiliate_click", re: /\baffiliate_click\b/ },
  { name: "AmazonAffiliateLink", re: /\bAmazonAffiliateLink\b/ },
  { name: "amazonAssociates_import", re: /@\/lib\/amazonAssociates|from ["'].*amazonAssociates["']/ },
  { name: "browse_on_amazon_cta", re: /Browse on Amazon/i },
  { name: "affiliate_disclosure_cta", re: /Affiliate disclosure:\s*MicStage may earn a commission/i },
];

/**
 * Files/dirs where Amazon Associates code and tracking ID are allowed.
 * Discovery links to /resources/open-mic-gear are OK elsewhere; amazon URLs / micstage-20 are not.
 */
const AFFILIATE_ALLOWLIST = new Set([
  "src/lib/amazonAssociates.ts",
  "src/components/resources/AmazonAffiliateLink.tsx",
  "src/app/resources/open-mic-gear/page.tsx",
  "src/lib/marketingTracking.ts", // event name type only
  "scripts/check-amazon-associates.mjs",
  "package.json",
]);

/**
 * Product / display surfaces that must never contain affiliate commerce.
 * Covers print/PDF helpers, lineup/TV/embed screens, QR/signage, booking/signup, host/venue ops.
 */
const FORBIDDEN_AFFILIATE_ROOTS = [
  "src/app/page.tsx",
  "src/app/dashboard",
  "src/app/host",
  "src/app/venue",
  "src/app/promoter",
  "src/app/artist",
  "src/app/register",
  "src/app/claim",
  "src/app/login",
  "src/app/nights",
  "src/app/venues",
  "src/app/open-mics",
  "src/app/media",
  "src/components/venue",
  "src/components/venues",
  "src/components/host",
  "src/components/MediaPrintOnQuery.tsx",
  "src/components/VenueBookingFlash.tsx",
  "src/lib/venueOpenMicQrUrl.ts",
  "src/lib/venuePublicLineup.ts",
  "src/lib/venuePublicLineupData.ts",
  "src/lib/promoterLineup.ts",
  "src/lib/host",
];

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
assert.doesNotMatch(page, /Tracking ID used on Amazon/i);
assert.doesNotMatch(page, /\bmicstage-20\b/, "tracking ID must not be visible copy on the resource page");
assert.doesNotMatch(page, /AMAZON_ASSOCIATES_TRACKING_ID/);

const linkComponent = read("src/components/resources/AmazonAffiliateLink.tsx");
assert.match(linkComponent, /affiliate_click/);
assert.match(linkComponent, /affiliate_network/);
assert.match(linkComponent, /tracking_id/);
assert.match(linkComponent, /destination/);
assert.match(linkComponent, /rel="noopener noreferrer sponsored"/);
assert.match(linkComponent, /target="_blank"/);

const marketing = read("src/lib/marketingTracking.ts");
assert.match(marketing, /"affiliate_click"/);
assert.doesNotMatch(marketing, /amazon\.com/i);
assert.doesNotMatch(marketing, /\bmicstage-20\b/);

const footer = read("src/components/SiteFooter.tsx");
assert.match(footer, /\/resources\/open-mic-gear/);
assert.match(footer, /Open Mic Gear/);
assert.doesNotMatch(footer, /amazon\.com|micstage-20|affiliate_click|AmazonAffiliateLink/i);

const resourcesIndex = read("src/app/resources/page.tsx");
assert.match(resourcesIndex, /\/resources\/open-mic-gear/);
assert.doesNotMatch(resourcesIndex, /amazon\.com|micstage-20|affiliate_click|AmazonAffiliateLink/i);

const sitemap = read("src/app/sitemap.ts");
assert.match(sitemap, /\/resources\/open-mic-gear/);
assert.doesNotMatch(sitemap, /amazon\.com|micstage-20|affiliate_click/i);

const associatesLib = read("src/lib/amazonAssociates.ts");
assert.match(associatesLib, /AMAZON_ASSOCIATES_TRACKING_ID = "micstage-20"/);

/** @returns {string[]} relative paths */
function listSourceFiles(absOrRel) {
  const abs = path.isAbsolute(absOrRel) ? absOrRel : path.join(root, absOrRel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) {
    return /\.(ts|tsx|js|jsx|mjs|css|md)$/.test(abs) ? [path.relative(root, abs).replace(/\\/g, "/")] : [];
  }
  /** @type {string[]} */
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const s = fs.statSync(full);
      if (s.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|css|md)$/.test(name)) continue;
      out.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  }
  walk(abs);
  return out;
}

// Global: only micstage-20 as Associates store ID / tag value in src
/** @type {string[]} */
const idOffenders = [];
for (const rel of listSourceFiles("src")) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const m of text.matchAll(/tag=([a-z0-9-]+)/gi)) {
    if (m[1] !== "micstage-20") idOffenders.push(`${rel}: tag=${m[1]}`);
  }
  for (const m of text.matchAll(/AMAZON_ASSOCIATES_TRACKING_ID\s*=\s*"([^"]+)"/g)) {
    if (m[1] !== "micstage-20") idOffenders.push(`${rel}: id=${m[1]}`);
  }
}
assert.equal(idOffenders.length, 0, `unexpected Amazon tracking IDs:\n${idOffenders.join("\n")}`);

// Affiliate commerce markers only in allowlisted files (editorial + wiring)
/** @type {string[]} */
const placementOffenders = [];
for (const rel of listSourceFiles("src")) {
  if (AFFILIATE_ALLOWLIST.has(rel)) continue;
  // Discovery-only mentions of the gear guide path are fine without affiliate markers.
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const marker of AFFILIATE_MARKERS) {
    if (marker.re.test(text)) {
      placementOffenders.push(`${rel}: ${marker.name}`);
    }
  }
}
assert.equal(
  placementOffenders.length,
  0,
  `affiliate markers outside allowlisted editorial surfaces:\n${placementOffenders.join("\n")}`,
);

// Explicit scan of print / TV / lineup / QR / booking / host-venue ops families
/** @type {string[]} */
const forbiddenOffenders = [];
for (const entry of FORBIDDEN_AFFILIATE_ROOTS) {
  if (!exists(entry)) continue;
  for (const rel of listSourceFiles(entry)) {
    if (AFFILIATE_ALLOWLIST.has(rel)) continue;
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const marker of AFFILIATE_MARKERS) {
      if (marker.re.test(text)) {
        forbiddenOffenders.push(`${rel}: ${marker.name}`);
      }
    }
    // Soft product-path CTA: do not deep-link shopping from ops UI
    if (/\/resources\/open-mic-gear/.test(text) && /Amazon|affiliate|shop|gear guide/i.test(text)) {
      forbiddenOffenders.push(`${rel}: open-mic-gear_shopping_cta`);
    }
  }
}
assert.equal(
  forbiddenOffenders.length,
  0,
  `affiliate/commerce markers in print/TV/PDF/lineup/booking/ops surfaces:\n${forbiddenOffenders.join("\n")}`,
);

console.log(
  `ok: amazon associates (${OPEN_MIC_GEAR_ITEMS.length} links, tag=${AMAZON_ASSOCIATES_TRACKING_ID}; placement guard ok)`,
);
