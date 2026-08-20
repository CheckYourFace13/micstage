/**
 * SEO indexability regression checks (no network).
 *   npx tsx scripts/check-seo-indexability.mjs
 */
import assert from "node:assert/strict";
import {
  isPublicListingRenderable,
  listingIsPubliclyIndexable,
  isPublicListingNameOk,
} from "../src/lib/publicListings/listingQuality.ts";
import {
  listingMeetsPublicSeoIndexGate,
  publicListingSeoTitle,
  publicListingSeoDescription,
  buildListingEventJsonLd,
  venueIsSitemapEligible,
} from "../src/lib/publicListings/listingSeo.ts";
import {
  sanitizePublicListingAbout,
  publicListingSourceLabel,
  isPublicListingSourceUrl,
} from "../src/lib/publicListings/listingAboutFromLead.ts";
import { shouldIndexDiscoveryPage } from "../src/lib/seo/discoveryIndex.ts";
import { buildPublicMetadata } from "../src/lib/publicSeo.ts";

function baseListing(over = {}) {
  return {
    name: "Blue Note Open Mic",
    verificationStatus: "VERIFIED",
    formattedAddress: "123 Main St, Chicago, IL",
    city: "Chicago",
    region: "IL",
    schedules: [{ weekday: "MON", title: "Monday open mic", description: null, performanceFormat: "OPEN_VARIETY" }],
    lastVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
    removedAt: null,
    sourceUrl: "https://bluenote.example/open-mic",
    websiteUrl: "https://bluenote.example",
    ...over,
  };
}

// OUTDATED / removed / malformed not renderable / not indexable
assert.equal(isPublicListingRenderable(baseListing({ verificationStatus: "OUTDATED" })), false);
assert.equal(isPublicListingRenderable(baseListing({ removedAt: new Date() })), false);
assert.equal(isPublicListingNameOk("How to mic a stage"), false);
assert.equal(isPublicListingNameOk("open mics near me"), false);
assert.equal(isPublicListingRenderable(baseListing({ name: "How to mic a stage" })), false);

assert.equal(listingIsPubliclyIndexable(baseListing({ verificationStatus: "OUTDATED" })), false);
assert.equal(listingIsPubliclyIndexable(baseListing({ removedAt: new Date() })), false);
assert.equal(listingIsPubliclyIndexable(baseListing({ schedules: [], lastVerifiedAt: null })), false);

// Trusted public listing indexable; removedAt cannot be sitemap/index
assert.equal(listingMeetsPublicSeoIndexGate(baseListing()), true);
assert.equal(listingMeetsPublicSeoIndexGate(baseListing({ removedAt: new Date() })), false);

// NEEDS_REVIEW may render but not index
assert.equal(isPublicListingRenderable(baseListing({ verificationStatus: "NEEDS_REVIEW" })), true);
assert.equal(listingMeetsPublicSeoIndexGate(baseListing({ verificationStatus: "NEEDS_REVIEW" })), false);

// City open-mic hubs: meaningful inventory required
assert.equal(
  shouldIndexDiscoveryPage({
    venueCount: 0,
    listingCount: 0,
    hasPublicSchedule: false,
    requireMeaningfulInventory: true,
  }),
  false,
);
assert.equal(
  shouldIndexDiscoveryPage({
    venueCount: 1,
    listingCount: 1,
    hasPublicSchedule: true,
    requireMeaningfulInventory: true,
  }),
  false,
  "thin 1-listing city must stay noindex even with schedule",
);
assert.equal(
  shouldIndexDiscoveryPage({
    venueCount: 2,
    listingCount: 2,
    hasPublicSchedule: false,
    requireMeaningfulInventory: true,
  }),
  false,
);
assert.equal(
  shouldIndexDiscoveryPage({
    venueCount: 2,
    listingCount: 2,
    hasPublicSchedule: true,
    requireMeaningfulInventory: true,
  }),
  true,
);
assert.equal(
  shouldIndexDiscoveryPage({
    venueCount: 3,
    listingCount: 3,
    hasPublicSchedule: false,
    requireMeaningfulInventory: true,
  }),
  true,
);

// Title sanity
assert.equal(publicListingSeoTitle({ name: "Blue Note Open Mic", city: "Chicago", region: "IL" }), "Blue Note Open Mic | Chicago, IL");
assert.equal(
  publicListingSeoTitle({ name: "The Hideout", city: "Chicago", region: "IL" }),
  "The Hideout | Open Mic in Chicago, IL",
);

const desc = publicListingSeoDescription(baseListing());
assert.match(desc, /Chicago/);
assert.match(desc, /Monday/);
assert.doesNotMatch(desc, /2020|2019/);

const thinDesc = publicListingSeoDescription(baseListing({ schedules: [], lastVerifiedAt: new Date() }));
assert.match(thinDesc, /Find schedule/);
assert.doesNotMatch(thinDesc, /happens weekly/);

// Recurring weekday only → NO Event JSON-LD
const recurringOnlyEvents = buildListingEventJsonLd({
  listingName: "Blue Note Open Mic",
  formattedAddress: "123 Main St",
  url: "https://micstage.com/open-mics/blue-note",
  occurrences: [],
});
assert.equal(recurringOnlyEvents.length, 0);

// Concrete occurrence with valid startDate → Event JSON-LD allowed
const concreteEvents = buildListingEventJsonLd({
  listingName: "Blue Note Open Mic",
  formattedAddress: "123 Main St",
  url: "https://micstage.com/open-mics/blue-note",
  occurrences: [{ startDate: "2026-08-21T20:00:00-05:00", name: "Friday open mic" }],
});
assert.equal(concreteEvents.length, 1);
assert.equal(concreteEvents[0]["@type"], "Event");
assert.equal(concreteEvents[0].startDate, "2026-08-21T20:00:00-05:00");

// Invalid / empty startDate rejected
assert.equal(
  buildListingEventJsonLd({
    listingName: "X",
    url: "https://micstage.com/x",
    occurrences: [{ startDate: "" }, { startDate: "not-a-date" }],
  }).length,
  0,
);

// Claim metadata: noindex,nofollow while remaining crawlable (not robots-disallow)
const claimMeta = buildPublicMetadata({
  title: "Claim this open mic",
  description: "Claim form",
  path: "/claim/example-slug",
  index: false,
  follow: false,
});
assert.equal(claimMeta.robots?.index, false);
assert.equal(claimMeta.robots?.follow, false);
assert.equal(claimMeta.robots?.googleBot?.index, false);
assert.equal(claimMeta.robots?.googleBot?.follow, false);

// Venue sitemap quality gate
assert.equal(
  venueIsSitemapEligible({
    name: "The Hideout",
    slug: "the-hideout",
    googlePlaceId: "ChIJabc",
    formattedAddress: "1354 W Wabansia Ave, Chicago, IL",
  }),
  true,
);
assert.equal(
  venueIsSitemapEligible({
    name: "X",
    slug: "x",
    googlePlaceId: null,
    formattedAddress: "",
  }),
  false,
);

assert.equal(
  sanitizePublicListingAbout(
    "Open mic venue identified from public listings and web search. Discovered via autonomous_web_search.",
  ),
  null,
);
assert.equal(
  sanitizePublicListingAbout(
    "Open mic venue identified from public listings and web search. Performers: live music. Come for <strong>night</strong> of talent 2025-01-06 18:00:00",
  ),
  null,
);
assert.match(
  sanitizePublicListingAbout("Typical formats: comedy, live music. A weekly songwriter night with a posted door list.") ?? "",
  /songwriter/,
);
assert.equal(publicListingSourceLabel("autonomous web search"), null);
assert.equal(publicListingSourceLabel("The Hideout events calendar"), "The Hideout events calendar");
assert.equal(isPublicListingSourceUrl("https://www.google.com/search?q=open+mic"), false);
assert.equal(isPublicListingSourceUrl("https://hideoutchicago.com/open-mic"), true);

console.log(JSON.stringify({ ok: true, checks: "seo-indexability" }));
