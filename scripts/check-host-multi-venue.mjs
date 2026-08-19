/**
 * Host multi-venue authorization, night-first lineup, outreach, and claim security checks.
 * Run: npm run test:host-multi-venue
 */
import assert from "node:assert/strict";
import { classifyHostOutreachFromEvidence, HOST_OUTREACH_CTA_PATH } from "../src/lib/growth/hostOutreachSignals.ts";
import { extractHostIdentityFromEvidence } from "../src/lib/growth/hostIdentityExtraction.ts";
import { publicLineupPathForNightId } from "../src/lib/host/hostNightProvisioning.ts";
import { allocateUniqueHostSlug, slugifyHostName } from "../src/lib/host/hostSlug.ts";
import { safePublicVenueReturnPath } from "../src/lib/publicVenueReturnPath.ts";

assert.equal(slugifyHostName("Chris's Open Mic"), "chris-s-open-mic");
assert.equal(HOST_OUTREACH_CTA_PATH, "/host");
assert.equal(publicLineupPathForNightId("night_abc"), "/nights/night_abc/lineup");

const hostSignal = classifyHostOutreachFromEvidence({
  name: "Tuesday Comedy at The Cellar",
  snippet: "Hosted by Marvin Productions every Tuesday. Sign up at the door.",
  eventName: "Marvin's Comedy Open Mic",
  sourceUrl: "https://example.com/events",
});
assert.equal(hostSignal.isHostCandidate, true);

const extracted = extractHostIdentityFromEvidence({
  name: "Blue Note",
  snippet: "Hosted by Jane Smith every Monday.",
  eventName: "Jane's Songwriter Night",
  sourceUrl: "https://example.com",
});
assert.ok(extracted?.hostBrand);

const venueOnly = classifyHostOutreachFromEvidence({
  name: "Blue Note Jazz Club",
  snippet: "Live jazz every Friday.",
  eventName: null,
  sourceUrl: null,
});
assert.equal(venueOnly.isHostCandidate, false);

let taken = new Set();
const slug = await allocateUniqueHostSlug("Test Host", async (s) => taken.has(s));
assert.ok(slug.startsWith("test-host"));
taken.add(slug);
const slug2 = await allocateUniqueHostSlug("Test Host", async (s) => taken.has(s));
assert.notEqual(slug, slug2);

assert.equal(safePublicVenueReturnPath("foo-bar", "/nights/n1/lineup", { nightId: "n1" }), "/nights/n1/lineup");
assert.equal(safePublicVenueReturnPath("foo-bar", "https://evil.com", { nightId: "n1" }), "/nights/n1/lineup");

console.log(JSON.stringify({ ok: true, checks: "host-multi-venue" }));
