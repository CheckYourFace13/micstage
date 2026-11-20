/**
 * Homepage SSR mix: max 3 per metro, US regional round-robin.
 * Run: npx tsx scripts/check-homepage-geo-mix.mjs
 */
import assert from "node:assert/strict";
import {
  homepageGeoBucket,
  homepageMetroKey,
  selectHomepageVerifiedMix,
} from "../src/lib/publicListings/homepageVerified.ts";

assert.equal(homepageMetroKey("Chicago", "IL"), "chicago-il");
assert.equal(homepageMetroKey("Evanston", "IL"), "chicago-il");
assert.equal(homepageMetroKey("Austin", "TX"), "austin-tx");
assert.equal(homepageMetroKey("Toronto", "ON"), "toronto-ca");
assert.equal(homepageMetroKey("London", "England"), "london-uk");
assert.equal(homepageGeoBucket("Austin", "TX"), "south");
assert.equal(homepageGeoBucket("Boston", "MA"), "northeast");
assert.equal(homepageGeoBucket("Seattle", "WA"), "west");
assert.equal(homepageGeoBucket("Toronto", "ON"), "international");

const chicagoHeavy = [];
for (let i = 0; i < 10; i++) {
  chicagoHeavy.push({
    metroKey: "chicago-il",
    geoBucket: "midwest",
    hasConfirmedSchedule: true,
    hasAnySchedule: true,
    name: `Chicago Room ${i}`,
  });
}
for (const [city, region, bucket, metro] of [
  ["Austin", "TX", "south", "austin-tx"],
  ["Boston", "MA", "northeast", "boston-ma"],
  ["Seattle", "WA", "west", "seattle-wa"],
  ["Nashville", "TN", "south", "nashville-tn"],
  ["Atlanta", "GA", "south", "atlanta-ga"],
  ["Portland", "OR", "west", "portland-or"],
  ["Toronto", "ON", "international", "toronto-ca"],
]) {
  chicagoHeavy.push({
    metroKey: metro,
    geoBucket: bucket,
    hasConfirmedSchedule: true,
    hasAnySchedule: true,
    name: `${city} Open Mic`,
  });
}

// Add a second room in a few metros so the strip can fill to 12 without >3 Chicago.
for (const [name, metro, bucket] of [
  ["Austin Room 2", "austin-tx", "south"],
  ["Boston Room 2", "boston-ma", "northeast"],
  ["Seattle Room 2", "seattle-wa", "west"],
]) {
  chicagoHeavy.push({
    metroKey: metro,
    geoBucket: bucket,
    hasConfirmedSchedule: true,
    hasAnySchedule: true,
    name,
  });
}

const picked = selectHomepageVerifiedMix(chicagoHeavy, 12);
assert.equal(picked.length, 12);
const chicagoCount = picked.filter((p) => p.metroKey === "chicago-il").length;
assert.ok(chicagoCount <= 3, `expected <=3 Chicago, got ${chicagoCount}`);
const metros = new Set(picked.map((p) => p.metroKey));
assert.ok(metros.size >= 5, `expected geographic mix, got ${[...metros].join(",")}`);
assert.ok(
  picked.some((p) => p.geoBucket === "northeast"),
  "northeast should appear when inventory exists",
);
assert.ok(picked.some((p) => p.geoBucket === "south"), "south should appear when inventory exists");
assert.ok(picked.some((p) => p.geoBucket === "west"), "west should appear when inventory exists");

console.log("ok: homepage geo mix", { chicagoCount, metros: [...metros] });
