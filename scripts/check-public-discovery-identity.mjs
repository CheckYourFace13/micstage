/**
 * Self-check for public discovery identity dedupe.
 * Usage: node scripts/check-public-discovery-identity.mjs
 */
import assert from "node:assert/strict";
import {
  dedupeByPublicDiscoveryIdentity,
  normalizePublicDiscoveryName,
  publicDiscoveryIdentityKey,
} from "../src/lib/publicListings/publicDiscoveryIdentity.ts";

assert.equal(normalizePublicDiscoveryName("The Blue Note Open Mic Night"), "blue note");
assert.equal(normalizePublicDiscoveryName("Blue Note"), "blue note");

assert.equal(
  publicDiscoveryIdentityKey({ googlePlaceId: "ChIJ_abc", name: "A", city: "Chicago" }),
  "place:ChIJ_abc",
);
assert.equal(
  publicDiscoveryIdentityKey({ name: "Blue Note Open Mic", city: "Chicago", region: "IL" }),
  publicDiscoveryIdentityKey({ name: "The Blue Note", city: "Chicago", region: "IL" }),
);

const rows = [
  { id: "listing-dup", name: "Blue Note Open Mic", city: "Chicago", region: "IL", kind: "verified", hasSchedule: true },
  { id: "venue-win", name: "Blue Note", city: "Chicago", region: "IL", kind: "claimed", bookable: true, hasSchedule: true },
  { id: "other", name: "Hideout", city: "Chicago", region: "IL", kind: "verified", hasSchedule: false },
  {
    id: "place-a",
    name: "Weird Title A",
    city: "Austin",
    region: "TX",
    googlePlaceId: "ChIJ_same",
    kind: "verified",
  },
  {
    id: "place-b",
    name: "Weird Title B",
    city: "Austin",
    region: "TX",
    googlePlaceId: "ChIJ_same",
    kind: "claimed",
    bookable: true,
  },
];

const deduped = dedupeByPublicDiscoveryIdentity(
  rows,
  (r) => ({ googlePlaceId: r.googlePlaceId, name: r.name, city: r.city, region: r.region }),
  (r) => ({ kind: r.kind, bookable: r.bookable, hasSchedule: r.hasSchedule }),
);

assert.equal(deduped.length, 3);
assert.equal(deduped.find((r) => r.city === "Chicago" && r.name.includes("Blue"))?.id, "venue-win");
assert.equal(deduped.find((r) => r.googlePlaceId === "ChIJ_same")?.id, "place-b");
assert.ok(deduped.some((r) => r.id === "other"));

console.log("check-public-discovery-identity: ok");
