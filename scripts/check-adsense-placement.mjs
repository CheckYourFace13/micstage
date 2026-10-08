/**
 * Regression guard: AdSense only on approved editorial/discovery surfaces.
 * Run: node scripts/check-adsense-placement.mjs
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
  "/",
  "/host",
  "/resources",
  "/resources/open-mic-gear",
  "/resources/how-to-run-a-successful-open-mic-night",
  "/locations",
  "/locations/chicago-il/open-mics",
  "/find-open-mics",
  "/venues",
  "/artists",
  "/performers",
  "/map",
  "/compare",
];
const deny = [
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

assert.equal(shouldShowAdsOnPath("/"), false, "homepage is not an ad surface");
assert.equal(shouldShowAdsOnPath("/host"), false, "host marketing/conversion is not an ad surface");

for (const p of allow) {
  if (p === "/" || p === "/host") continue;
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

/** Display units must not be imported into ops / lineup / booking surfaces. */
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
  "src/components/venue",
  "src/components/host",
];

/** @type {string[]} */
const offenders = [];
function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return;
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

console.log("ok: adsense placement guard");
