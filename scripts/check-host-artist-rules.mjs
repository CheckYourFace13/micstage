/**
 * Host Artist Rules + series reuse checks (no network).
 *   npx tsx scripts/check-host-artist-rules.mjs
 */
import assert from "node:assert/strict";

// Artist rules live on PromoterSeries and are copied onto EventTemplate.description at provision.
const { readFileSync } = await import("node:fs");
const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /artistRules\s+String\?\s+@db\.Text/, "PromoterSeries.artistRules must exist");

const provision = readFileSync("src/lib/host/hostNightProvisioning.ts", "utf8");
assert.match(provision, /artistRules/, "provisioning must read series artistRules");
assert.match(provision, /description:\s*artistRules/, "provisioning must write rules onto EventTemplate.description");

const nightActions = readFileSync("src/app/promoter/night-actions.ts", "utf8");
assert.match(nightActions, /artistRules/, "host night save must accept artistRules");
assert.match(nightActions, /applyFutureNights/, "host night save must offer apply-to-future");

const managePage = readFileSync("src/app/promoter/nights/[nightId]/page.tsx", "utf8");
assert.match(managePage, /Artist rules/, "manage night UI exposes Artist rules");
assert.match(managePage, /Share signup link/, "share signup is prominent on manage night");

const lineupPage = readFileSync("src/app/nights/[nightId]/lineup/page.tsx", "utf8");
assert.match(lineupPage, /Artist rules · read before you sign up/, "performers see rules before signup");
assert.match(lineupPage, /ignoreVenueBookingWindow/, "host signup is not blocked by venue booking window");

const board = readFileSync("src/components/venue/VenueLineupBoard.tsx", "utf8");
assert.match(board, /open spot/, "open spots badge is shown on lineup board");

const hostPage = readFileSync("src/app/hosts/[slug]/page.tsx", "utf8");
assert.match(hostPage, /OPEN SPOTS · Sign up/, "host public page surfaces open spots CTA");

const discovery = readFileSync("src/lib/publicListings/discoveryMerge.ts", "utf8");
assert.match(discovery, /OPEN SPOTS · Sign up/, "finder deep-links host nights with open spots");
assert.match(discovery, /\/nights\/\$\{hostSignup\.nightId\}\/lineup/, "finder href points at night lineup");

console.log(JSON.stringify({ ok: true, checks: "host-artist-rules" }));
