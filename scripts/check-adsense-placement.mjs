/**
 * AdSense ownership stays live; ad units/loaders stay off until approval.
 * Run: npx tsx scripts/check-adsense-placement.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { shouldShowAdsOnPath, ADSENSE_PUBLISHER_ID, ADSENSE_ENABLED } from "../src/lib/adsense.ts";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

assert.equal(ADSENSE_PUBLISHER_ID, "ca-pub-9572509189594279");
assert.equal(
  ADSENSE_ENABLED,
  process.env.NEXT_PUBLIC_ENABLE_ADSENSE === "true",
  "ADSENSE_ENABLED must require explicit NEXT_PUBLIC_ENABLE_ADSENSE while awaiting approval",
);

// Pending approval: path gate must deny everything (including former allowlist).
for (const p of [
  "/",
  "/resources",
  "/resources/how-to-run-a-successful-open-mic-night",
  "/locations/chicago-il/open-mics",
  "/locations/oklahoma/open-mics",
  "/this-page-definitely-does-not-exist-xyz-404",
  "/register/venue",
  "/claim/some-listing",
]) {
  assert.equal(shouldShowAdsOnPath(p), false, `expected ads blocked on ${p} while awaiting approval`);
}

const layout = read("src/app/layout.tsx");
assert.match(layout, /google-adsense-account/);
assert.match(layout, /ca-pub-9572509189594279/);
assert.doesNotMatch(layout, /<AdSenseScript/);
assert.doesNotMatch(
  layout,
  /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/,
  "root layout must not load AdSense JS globally",
);

const resourcesIndex = read("src/app/resources/page.tsx");
assert.doesNotMatch(resourcesIndex, /AdSenseDisplayAd|ADSENSE_SLOTS|adsbygoogle/);

const articlePage = read("src/app/resources/[slug]/page.tsx");
assert.doesNotMatch(articlePage, /AdSenseDisplayAd|ADSENSE_SLOTS|adsbygoogle/);
assert.match(articlePage, /getResourceArticleBySlug/);
assert.match(articlePage, /notFound\(\)/);

const adsTxtRoute = read("src/app/ads.txt/route.ts");
assert.match(adsTxtRoute, /ADSENSE_ADS_TXT_LINE|pub-9572509189594279|google\.com/);

const notFound = read("src/app/not-found.tsx");
assert.doesNotMatch(notFound, /AdSenseDisplayAd|adsbygoogle|ADSENSE_SLOTS/);

console.log("ok: adsense pending-approval guard (meta+ads.txt keep; loaders/slots off)");
