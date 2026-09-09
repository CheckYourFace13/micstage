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

// ---------------------------------------------------------------------------
// Multi-venue tagging: the sibling-venue lookup must actually find sibling venues.
// ---------------------------------------------------------------------------
const { tagHostMultiVenueProspect } = await import("../src/lib/growth/hostMultiVenueProspect.ts");

const hintWrites = [];
const multiVenuePrisma = {
  // A brand running at one other venue: two distinct venues in total.
  $queryRaw: async () => [{ id: "venue-2" }],
  marketingEvent: { findFirst: async () => null, create: async () => ({ id: "evt-1" }) },
  growthLead: {
    findUnique: async () => ({ id: "venue-1", discoveryHints: {} }),
    update: async (args) => {
      hintWrites.push({ id: args.where.id, data: args.data.discoveryHints });
      return { id: args.where.id };
    },
  },
};

const tagged = await tagHostMultiVenueProspect(multiVenuePrisma, {
  hostBrand: "Marvin Comedy Productions",
  venueLeadId: "venue-1",
  city: "Chicago",
});
assert.equal(tagged.tagged, true, "a brand at two venues must be tagged as a multi-venue host");
assert.equal(tagged.venueCount, 2);
assert.equal(hintWrites.length, 2, "both venues must carry the multi-venue hint");
assert.equal(hintWrites[0].data.hostMultiVenueCount, 2);

const lonePrisma = { ...multiVenuePrisma, $queryRaw: async () => [] };
const lone = await tagHostMultiVenueProspect(lonePrisma, {
  hostBrand: "One Room Only",
  venueLeadId: "venue-1",
});
assert.equal(lone.tagged, false, "a brand at a single venue is not a multi-venue host");

// ---------------------------------------------------------------------------
// `string_contains` without a `path` compiles to a filter that never matches on
// Postgres, so it silently reports zero. Verified against production: the same
// condition returned 0 rows where raw SQL returned 1,481.
// ---------------------------------------------------------------------------
const { readdirSync, readFileSync, statSync } = await import("node:fs");
const { join } = await import("node:path");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\{[^{}]*\bstring_contains\b[^{}]*\}/g)) {
    if (!m[0].includes("path")) offenders.push(`${file}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
  }
}
assert.deepEqual(offenders, [], `JSON string_contains without a path never matches:\n${offenders.join("\n")}`);

console.log(JSON.stringify({ ok: true, checks: "host-multi-venue" }));
