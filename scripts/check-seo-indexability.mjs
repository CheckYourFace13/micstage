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
  buildVenueNightEventJsonLd,
  venueHasPublicSchedule,
  venueIsSitemapEligible,
} from "../src/lib/publicListings/listingSeo.ts";
import {
  sanitizePublicListingAbout,
  publicListingSourceLabel,
  isPublicListingSourceUrl,
} from "../src/lib/publicListings/listingAboutFromLead.ts";
import { shouldIndexDiscoveryPage } from "../src/lib/seo/discoveryIndex.ts";
import { parseExplicitScheduleFromText } from "../src/lib/publicListings/explicitScheduleParse.ts";
import {
  explicitScheduleEndTimeMin,
  resolveTrustedListingTimeZone,
} from "../src/lib/publicListings/listingScheduleEnrichment.ts";
import { buildOwnerAttentionItems } from "../src/lib/ownerSummary/ownerAttention.ts";
import { scheduleWindowLabel } from "../src/lib/scheduleWindow.ts";
import { buildPublicMetadata } from "../src/lib/publicSeo.ts";
import fs from "node:fs";
import path from "node:path";

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
// lastVerifiedAt is a confirmation stamp, not a schedule substitute
assert.equal(listingIsPubliclyIndexable(baseListing({ schedules: [], lastVerifiedAt: new Date() })), false);
assert.equal(listingMeetsPublicSeoIndexGate(baseListing({ schedules: [], lastVerifiedAt: new Date() })), false);

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

// Dated venue-night helper: only absolute Date instances (no invented weekday recurrence)
const venueNightEvents = buildVenueNightEventJsonLd({
  venueName: "Jokers Comedy House",
  formattedAddress: "1 Main St",
  url: "https://micstage.com/venues/jokers/lineup/2026-10-14",
  nights: [
    {
      eventName: "Open mic",
      start: new Date("2026-10-14T23:00:00.000Z"),
      end: new Date("2026-10-15T02:00:00.000Z"),
    },
  ],
});
assert.equal(venueNightEvents.length, 1);
assert.equal(venueNightEvents[0]["@type"], "Event");
assert.equal(venueNightEvents[0].startDate, "2026-10-14T23:00:00.000Z");
assert.equal(
  buildVenueNightEventJsonLd({
    venueName: "Jokers Comedy House",
    url: "https://micstage.com/venues/jokers/lineup/2026-10-14",
    nights: [],
  }).length,
  0,
);

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

// Venue sitemap quality gate — place identity alone is not a schedule
assert.equal(
  venueHasPublicSchedule({ eventTemplates: [] }),
  false,
);
assert.equal(
  venueIsSitemapEligible({
    name: "The Hideout",
    slug: "the-hideout",
    googlePlaceId: "ChIJabc",
    formattedAddress: "1354 W Wabansia Ave, Chicago, IL",
  }),
  false,
);
assert.equal(
  venueIsSitemapEligible({
    name: "The Hideout",
    slug: "the-hideout",
    googlePlaceId: "ChIJabc",
    formattedAddress: "1354 W Wabansia Ave, Chicago, IL",
    eventTemplates: [{ isPublic: true }],
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

// Brand title must not include "| MicStage" when layout template already appends it
const hostPage = fs.readFileSync(path.join(process.cwd(), "src/app/host/page.tsx"), "utf8");
assert.match(hostPage, /title:\s*"Run every open mic you host — free"/);
assert.doesNotMatch(hostPage, /title:\s*"[^"]*\| MicStage"/);

const gearPage = fs.readFileSync(path.join(process.cwd(), "src/app/resources/open-mic-gear/page.tsx"), "utf8");
assert.doesNotMatch(gearPage, /title:\s*"[^"]*\| MicStage/);

assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/faq/page.tsx")));
assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/open-mics/page.tsx")));
assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/blog/page.tsx")));
const openMicsIndex = fs.readFileSync(path.join(process.cwd(), "src/app/open-mics/page.tsx"), "utf8");
assert.match(openMicsIndex, /permanentRedirect\("\/find-open-mics"\)/);
const blogIndex = fs.readFileSync(path.join(process.cwd(), "src/app/blog/page.tsx"), "utf8");
assert.match(blogIndex, /permanentRedirect\("\/resources"\)/);

assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/chicago/page.tsx")));
const chicagoAlias = fs.readFileSync(path.join(process.cwd(), "src/app/chicago/page.tsx"), "utf8");
assert.match(chicagoAlias, /permanentRedirect\("\/locations\/chicago-il\/open-mics"\)/);

const mw = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
assert.match(mw, /www\.micstage\.com/);
assert.match(mw, /micstage\.com/);
assert.match(mw, /301/);

const parsedSched = parseExplicitScheduleFromText("Open mic every Wednesday at 8:00 pm. Sign up at the door.");
assert.equal(parsedSched?.weekday, "WED");
assert.equal(parsedSched?.startTimeMin, 20 * 60);
assert.equal(parsedSched?.endTimeMin, null);
assert.equal(explicitScheduleEndTimeMin(parsedSched), null);
assert.equal(scheduleWindowLabel(parsedSched.startTimeMin, explicitScheduleEndTimeMin(parsedSched)), "8:00 PM");
assert.ok(parsedSched?.signupMethod);
assert.equal(parseExplicitScheduleFromText("Live music on weekends"), null);
const parsedWithEnd = parseExplicitScheduleFromText("Open mic every Friday from 8:00 pm to 10:00 pm");
assert.equal(explicitScheduleEndTimeMin(parsedWithEnd), 22 * 60);

assert.equal(
  resolveTrustedListingTimeZone({ timeZone: "America/Chicago", lat: 47.6062, lng: -122.3321 }),
  "America/Los_Angeles",
);
assert.equal(resolveTrustedListingTimeZone({ timeZone: "America/Chicago", lat: null, lng: null }), null);
assert.equal(resolveTrustedListingTimeZone({ timeZone: "", lat: null, lng: null }), null);
assert.equal(
  resolveTrustedListingTimeZone({ timeZone: "America/New_York", lat: null, lng: null }),
  "America/New_York",
);
assert.equal(
  resolveTrustedListingTimeZone({ timeZone: "America/Chicago", lat: 41.8781, lng: -87.6298 }),
  "America/Chicago",
);

const enrichSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/publicListings/listingScheduleEnrichment.ts"), "utf8");
assert.doesNotMatch(enrichSrc, /PLACEHOLDER_END_MIN/);
assert.doesNotMatch(enrichSrc, /timeZone:\s*row\.timeZone\s*\|\|\s*"America\/Chicago"/);
assert.doesNotMatch(enrichSrc, /startTimeMin\s*\+\s*90/);

const summarySrc = fs.readFileSync(path.join(process.cwd(), "src/lib/ownerSummary/ownerDailySummaryEmail.ts"), "utf8");
assert.doesNotMatch(summarySrc, /indexableScheduledListings:\s*-1/);
assert.doesNotMatch(summarySrc, /schedulesAutoConfirmedToday:\s*-1/);
assert.match(summarySrc, /indexableScheduledListings:\s*data\.listingsInventory\.indexableScheduledListings/);
assert.match(summarySrc, /schedulesAutoConfirmedToday:\s*data\.listingsInventory\.schedulesAutoConfirmedToday/);
const builderSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/ownerSummary/buildOwnerDailySummary.ts"), "utf8");
assert.match(builderSrc, /indexableScheduledListings/);
assert.match(builderSrc, /schedulesAutoConfirmedToday/);
assert.match(builderSrc, /sourceUrl:\s*\{\s*not:\s*null\s*\}/);
assert.match(builderSrc, /uniqueClickLeadsCount:\s*uniqueClicksToday/);
assert.doesNotMatch(builderSrc, /Proxy: growth leads moved to CLICKED/);

const attentionExtras = {
  listingsCreatedToday: 3,
  autoRejectedToday: 2,
  netEligibleOutreach: 4,
  chicagoHour: 12,
  unscheduledVerified: 10,
  uniqueClicks7d: 0,
  registrations7d: 1,
  claims7d: 0,
  junkCandidateRate: 0.05,
};

const scheduleFailed = buildOwnerAttentionItems({
  outreachEnabled: true,
  killSwitch: false,
  emailsSentToday: 24,
  dailyCap: 50,
  providerHeadroom: 26,
  bounceRate: 0,
  complaintRate: 0,
  autoSendReady: 10,
  leadsCreatedToday: 3,
  needsReviewCount: 10,
  autoVerifiedToday: 2,
  inviteReady: 4,
  claimInvitesSentToday: 1,
  unclaimedVerified: 20,
  indexableScheduledListings: 0,
  schedulesAutoConfirmedToday: 0,
  lastTickAgeHours: 0.2,
  ...attentionExtras,
  unscheduledVerified: 80,
});
assert.ok(scheduleFailed.some((i) => i.code === "schedule_enrichment"));

const attentionNone = buildOwnerAttentionItems({
  outreachEnabled: true,
  killSwitch: false,
  emailsSentToday: 24,
  dailyCap: 50,
  providerHeadroom: 26,
  bounceRate: 0,
  complaintRate: 0,
  autoSendReady: 10,
  leadsCreatedToday: 3,
  needsReviewCount: 10,
  autoVerifiedToday: 2,
  inviteReady: 4,
  claimInvitesSentToday: 1,
  unclaimedVerified: 20,
  indexableScheduledListings: 5,
  schedulesAutoConfirmedToday: 1,
  lastTickAgeHours: 0.2,
  ...attentionExtras,
});
assert.equal(attentionNone.length, 0);

const discoveryOutpace = buildOwnerAttentionItems({
  outreachEnabled: true,
  killSwitch: false,
  emailsSentToday: 24,
  dailyCap: 50,
  providerHeadroom: 26,
  bounceRate: 0,
  complaintRate: 0,
  autoSendReady: 10,
  leadsCreatedToday: 20,
  listingsCreatedToday: 20,
  needsReviewCount: 50,
  autoVerifiedToday: 1,
  autoRejectedToday: 1,
  inviteReady: 4,
  claimInvitesSentToday: 1,
  unclaimedVerified: 20,
  indexableScheduledListings: 5,
  schedulesAutoConfirmedToday: 1,
  lastTickAgeHours: 0.2,
  netEligibleOutreach: 4,
  chicagoHour: 12,
  unscheduledVerified: 10,
  uniqueClicks7d: 0,
  registrations7d: 1,
  claims7d: 0,
  junkCandidateRate: 0.05,
});
assert.ok(discoveryOutpace.some((i) => i.code === "discovery_outpacing"));

const clicksNoConvert = buildOwnerAttentionItems({
  outreachEnabled: true,
  killSwitch: false,
  emailsSentToday: 24,
  dailyCap: 50,
  providerHeadroom: 26,
  bounceRate: 0,
  complaintRate: 0,
  autoSendReady: 10,
  leadsCreatedToday: 3,
  listingsCreatedToday: 3,
  needsReviewCount: 10,
  autoVerifiedToday: 2,
  autoRejectedToday: 2,
  inviteReady: 4,
  claimInvitesSentToday: 1,
  unclaimedVerified: 20,
  indexableScheduledListings: 5,
  schedulesAutoConfirmedToday: 1,
  lastTickAgeHours: 0.2,
  netEligibleOutreach: 4,
  chicagoHour: 12,
  unscheduledVerified: 10,
  uniqueClicks7d: 3,
  registrations7d: 0,
  claims7d: 0,
  junkCandidateRate: 0.05,
});
assert.ok(clicksNoConvert.some((i) => i.code === "clicks_no_convert"));

console.log(JSON.stringify({ ok: true, checks: "seo-indexability" }));
