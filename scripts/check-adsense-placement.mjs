/**
 * Regression guard: AdSense only on editorial resources + city open-mic hubs.
 * Run: npx tsx scripts/check-adsense-placement.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { shouldShowAdsOnPath, ADSENSE_PUBLISHER_ID } from "../src/lib/adsense.ts";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

assert.equal(ADSENSE_PUBLISHER_ID, "ca-pub-9572509189594279");

const allow = [
  "/resources",
  "/resources/how-to-run-a-successful-open-mic-night",
  "/resources/what-to-expect-at-your-first-open-mic",
  "/locations/chicago-il/open-mics",
  "/locations/open-mics-ca/open-mics",
];

const deny = [
  "/",
  "/host",
  "/faq",
  "/about",
  "/contact",
  "/find-open-mics",
  "/venues",
  "/artists",
  "/performers",
  "/map",
  "/compare",
  "/locations",
  "/locations/chicago-il/performers",
  "/resources/open-mic-gear",
  "/open-mics/some-listing",
  "/venues/some-venue",
  "/venues/some-venue/lineup",
  "/venues/some-venue/lineup/2026-01-01",
  "/nights/abc/lineup",
  "/register/venue",
  "/register/musician",
  "/register/promoter",
  "/login/venue",
  "/login/musician",
  "/login/promoter",
  "/promoter",
  "/venue",
  "/artist",
  "/dashboard",
  "/claim/some-listing",
  "/messages",
  "/media",
  "/media/how-to-artists",
  "/internal/admin",
  "/api/health",
  "/unsubscribe",
];

for (const p of allow) {
  assert.equal(shouldShowAdsOnPath(p), true, `expected ads allowed on ${p}`);
}
for (const p of deny) {
  assert.equal(shouldShowAdsOnPath(p), false, `expected ads blocked on ${p}`);
}

const layout = read("src/app/layout.tsx");
assert.match(layout, /google-adsense-account/);
assert.match(layout, /ca-pub-9572509189594279/);
assert.match(layout, /AdSenseScript/);
assert.doesNotMatch(
  layout,
  /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/,
  "root layout must not load AdSense JS globally",
);

const script = read("src/components/ads/AdSenseScript.tsx");
assert.match(script, /shouldShowAdsOnPath/);
assert.match(script, /pagead2\.googlesyndication\.com/);

const display = read("src/components/ads/AdSenseDisplayAd.tsx");
assert.match(display, /shouldShowAdsOnPath/);

const adsenseLib = read("src/lib/adsense.ts");
assert.match(adsenseLib, /open-mic-gear/);
assert.match(adsenseLib, /\/locations\/\[market\]\/open-mics|\/locations\/\[^\/\]\+\/open-mics/);

/** Display units must not be imported into ops / lineup / booking / product hubs. */
const forbiddenImportRoots = [
  "src/app/promoter",
  "src/app/venue",
  "src/app/artist",
  "src/app/register",
  "src/app/login",
  "src/app/claim",
  "src/app/nights",
  "src/app/dashboard",
  "src/app/messages",
  "src/app/media",
  "src/app/open-mics",
  "src/app/find-open-mics",
  "src/app/compare",
  "src/app/map",
  "src/app/artists",
  "src/app/performers",
  "src/app/venues",
  "src/app/host",
  "src/app/faq",
  "src/app/resources/open-mic-gear",
  "src/components/venue",
  "src/components/host",
];

/** @type {string[]} */
const offenders = [];
function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return;
  const st0 = fs.statSync(abs);
  if (st0.isFile()) {
    const text = fs.readFileSync(abs, "utf8");
    if (/AdSenseDisplayAd|AdSenseScript|adsbygoogle|ADSENSE_SLOTS/.test(text)) {
      offenders.push(dir.replace(/\\/g, "/"));
    }
    return;
  }
  for (const name of fs.readdirSync(abs)) {
    const full = path.join(abs, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(path.relative(root, full).replace(/\\/g, "/"));
      continue;
    }
    if (!/\.(tsx|ts|jsx|js)$/.test(name)) continue;
    const text = fs.readFileSync(full, "utf8");
    if (/AdSenseDisplayAd|AdSenseScript|adsbygoogle|ADSENSE_SLOTS/.test(text)) {
      offenders.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  }
}
for (const dir of forbiddenImportRoots) walk(dir);
assert.equal(offenders.length, 0, `AdSense imports in forbidden surfaces:\n${offenders.join("\n")}`);

// Performers market pages must not ship display ad units (path gate also blocks).
const performersPage = read("src/app/locations/[locationSlug]/performers/page.tsx");
assert.doesNotMatch(performersPage, /AdSenseDisplayAd|ADSENSE_SLOTS/);

console.log("ok: adsense placement guard (editorial + city open-mics only)");
