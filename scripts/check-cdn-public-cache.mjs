/**
 * Regression: public discovery pages must opt into ISR; private chrome must not
 * call cookies()/headers() in the root layout or SiteHeader/SiteFooter servers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const layout = read("src/app/layout.tsx");
assert.doesNotMatch(layout, /from ["']next\/headers["']/);
assert.doesNotMatch(layout, /await headers\s*\(/);
assert.doesNotMatch(layout, /getAuthUiState|getSession/);
assert.match(layout, /EmbedAwareChrome/);

const header = read("src/components/SiteHeader.tsx");
assert.doesNotMatch(header, /getAuthUiState|getSession|cookies\s*\(/);
assert.match(header, /SiteHeaderAuthClient/);

const footer = read("src/components/SiteFooter.tsx");
assert.doesNotMatch(footer, /getAuthUiState|cookies\s*\(/);

const mapPage = read("src/app/map/page.tsx");
assert.match(mapPage, /export const revalidate\s*=\s*300/);
assert.doesNotMatch(mapPage, /force-dynamic/);
assert.doesNotMatch(mapPage, /loadMergedOpenMicMapVenues/);
assert.match(mapPage, /<OpenMicMapClient\s*\/>/);

const mapApi = read("src/app/api/public/map/venues/route.ts");
assert.match(mapApi, /s-maxage/);
assert.match(mapApi, /loadMergedOpenMicMapVenues/);

const mapClient = read("src/components/map/OpenMicMapClient.tsx");
assert.match(mapClient, /\/api\/public\/map\/venues/);

for (const [path, re] of [
  ["src/app/page.tsx", /export const revalidate\s*=\s*300/],
  ["src/app/find-open-mics/page.tsx", /export const revalidate\s*=\s*300/],
  ["src/app/contact/page.tsx", /export const revalidate\s*=\s*600/],
  ["src/app/locations/page.tsx", /export const revalidate\s*=\s*300/],
  ["src/app/open-mics/[listingSlug]/page.tsx", /export const revalidate\s*=\s*300/],
  ["src/app/locations/[locationSlug]/open-mics/page.tsx", /export const revalidate\s*=\s*300/],
]) {
  assert.match(read(path), re, path);
}

assert.match(
  read("src/app/open-mics/[listingSlug]/page.tsx"),
  /export async function generateStaticParams/,
);
assert.match(
  read("src/app/locations/[locationSlug]/open-mics/page.tsx"),
  /export async function generateStaticParams/,
);

const authUi = read("src/app/api/public/auth-ui/route.ts");
assert.match(authUi, /private, no-store/);

const seo = read("src/lib/publicSeo.ts");
assert.match(seo, /www\.micstage\.com/);
assert.match(seo, /hostname = "micstage\.com"/);

console.log("check-cdn-public-cache: ok");
