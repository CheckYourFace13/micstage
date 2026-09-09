/**
 * Discovery identity regressions: a search-result page title must never become a venue lead.
 *
 * Covers: directory/listicle rejection, venue extraction from a directory, the Google Place
 * requirement on the venue lane, the host lane exemption, and duplicate collapsing.
 */
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_URL ??= "https://micstage.com";

const { extractVenueCandidatesFromPage, isUsableVenueName } = await import(
  "../src/lib/growth/discovery/venueCandidateExtraction.ts"
);
const {
  placeResolutionIsUsable,
  placeLookupKey,
  PlaceLookupBudget,
  createPlaceLookupBudget,
  discoveryPlaceLookupsPerDay,
  resolveVenueCandidateWithPlaces,
  isUnitedStatesAddress,
  domainsAgree,
} = await import("../src/lib/growth/discovery/venuePlaceResolution.ts");
const { ingestGrowthLeadCandidate } = await import("../src/lib/growth/growthLeadIngest.ts");
const { findExistingGrowthLeadForDedupe } = await import("../src/lib/growth/growthLeadDedupe.ts");

const failures = [];
function check(label, fn) {
  try {
    fn();
    return true;
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    return false;
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Real page titles that reached production as venue leads must be rejected.
// ---------------------------------------------------------------------------
const REJECT_NAMES = [
  "Post Your Open Mic",
  "Bars & Nightlife in Columbus Ohio",
  "ComedyList",
  "Types Of Events",
  "Open",
  "Must",
  "Community",
  "Public Events",
  "Taking Advantage of Open Mic Nights",
  "Laugh it Up at 5 Top Comedy Clubs in Minneapolis",
  "Comedy Open Mic Tickets, Live at Small Rooms",
  "The 15 Best Open Mics in Austin",
  "Best Open Mic Nights Near Me",
  "Top 10 Comedy Clubs in Chicago 2026",
  "Live music venues, bars and restaurants",
  "Open Jam Sessions in Denver",
  "Things to do in Nashville",
  "https://example.com/open-mic",
];
for (const name of REJECT_NAMES) {
  check(`rejects page-title name ${JSON.stringify(name)}`, () => {
    assert.equal(isUsableVenueName(name), false);
  });
}

const ALLOW_NAMES = [
  "The Blue Note Tavern",
  "Cactus Cafe",
  "Chetco Brewing Company",
  "Summit City Comedy Club",
  "The Slippery Noodle Inn",
  "White Rabbit Cabaret",
  "Hoppy Wobbles Pub",
  "150 Prospect Coffee House",
];
for (const name of ALLOW_NAMES) {
  check(`allows real venue name ${JSON.stringify(name)}`, () => {
    assert.equal(isUsableVenueName(name), true);
  });
}

// ---------------------------------------------------------------------------
// 2. A directory/listicle page yields its venues, never itself.
// ---------------------------------------------------------------------------
const LISTICLE_HTML = `<!doctype html><html><head>
<title>The 15 Best Open Mics in Austin | Austin Music Guide</title>
<meta property="og:site_name" content="Austin Music Guide">
</head><body>
<h1>The 15 Best Open Mics in Austin</h1>
<h2>1. Cactus Cafe</h2>
<p>Every Monday at <a href="https://cactuscafe.org/">Cactus Cafe</a>, sign up at 8pm.</p>
<h2>2. The Blue Note Tavern</h2>
<p>Open mic Wednesdays at <a href="https://bluenotetavern.com/events">The Blue Note Tavern</a>.</p>
<h3>Read more</h3>
<p><a href="https://www.facebook.com/austinmusic">Follow us on Facebook</a></p>
<p><a href="https://eventbrite.com/e/12345">Tickets</a></p>
</body></html>`;

const listicle = extractVenueCandidatesFromPage({
  pageUrl: "https://austinmusicguide.com/best-open-mics-in-austin",
  html: LISTICLE_HTML,
  serpTitle: "The 15 Best Open Mics in Austin",
});

check("listicle page is classified as directory/article", () => {
  assert.equal(listicle.pageRole, "directory_or_article");
});
check("listicle title never becomes a venue candidate", () => {
  const names = listicle.candidates.map((c) => c.name.toLowerCase());
  assert.equal(
    names.some((n) => n.includes("best open mics") || n.includes("austin music guide")),
    false,
    `article title leaked into candidates: ${JSON.stringify(names)}`,
  );
});
check("real venues are extracted from the listicle", () => {
  const names = listicle.candidates.map((c) => c.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("cactus cafe")), `missing Cactus Cafe in ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.includes("blue note tavern")), `missing Blue Note Tavern in ${JSON.stringify(names)}`);
});
check("extracted venues carry their own website, not the article's", () => {
  const cactus = listicle.candidates.find((c) => c.name.toLowerCase().includes("cactus"));
  assert.ok(cactus, "Cactus Cafe candidate missing");
  assert.ok(
    cactus.websiteUrl?.includes("cactuscafe.org"),
    `expected venue's own domain, got ${cactus.websiteUrl}`,
  );
});
check("social and ticketing links are not treated as venues", () => {
  const names = listicle.candidates.map((c) => c.name.toLowerCase());
  assert.equal(names.some((n) => n.includes("facebook") || n.includes("tickets")), false);
});
check("the same venue mentioned twice collapses to one candidate", () => {
  const cactusCount = listicle.candidates.filter((c) => c.name.toLowerCase().includes("cactus cafe")).length;
  assert.equal(cactusCount, 1);
});

// A newspaper's own JSON-LD must not turn the publisher into a venue.
const PUBLISHER_HTML = `<!doctype html><html><head>
<title>Queer comedy open mic filled a void | Chicago Sun-Times</title>
<meta property="og:site_name" content="Chicago Sun-Times">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"NewsMediaOrganization","name":"Chicago Sun-Times",
 "address":{"@type":"PostalAddress","streetAddress":"848 E Grand Ave","addressLocality":"Chicago","addressRegion":"IL"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"Queer Comedy Open Mic",
 "location":{"@type":"BarOrPub","name":"The Green Mill","address":{"@type":"PostalAddress",
 "streetAddress":"4802 N Broadway","addressLocality":"Chicago","addressRegion":"IL"}}}
</script>
</head><body><h1>Queer comedy open mic filled a void</h1></body></html>`;

const publisherPage = extractVenueCandidatesFromPage({
  pageUrl: "https://chicago.suntimes.com/nextvoices/2024/10/18/queer-lgbtq-comedy-open-mic",
  html: PUBLISHER_HTML,
});
check("news article is classified as directory/article", () => {
  assert.equal(publisherPage.pageRole, "directory_or_article");
});
check("the publishing newspaper is never extracted as a venue", () => {
  const names = publisherPage.candidates.map((c) => c.name.toLowerCase());
  assert.equal(names.some((n) => n.includes("sun-times")), false, `publisher leaked: ${JSON.stringify(names)}`);
});
check("the venue named inside the article is extracted", () => {
  const names = publisherPage.candidates.map((c) => c.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("green mill")), `missing venue in ${JSON.stringify(names)}`);
});
check("associations and chambers are not venues", () => {
  assert.equal(isUsableVenueName("Northalsted Business Alliance"), false);
  assert.equal(isUsableVenueName("Greater Austin Chamber of Commerce"), false);
});

// ---------------------------------------------------------------------------
// 3. A first-party venue site uses its declared identity, not its SEO title.
// ---------------------------------------------------------------------------
const VENUE_HTML = `<!doctype html><html><head>
<title>Open Mic Night Every Tuesday | Live Music in Austin, TX | Book Now</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BarOrPub","name":"Cactus Cafe",
 "url":"https://cactuscafe.org/","address":{"@type":"PostalAddress",
 "streetAddress":"2247 Guadalupe St","addressLocality":"Austin","addressRegion":"TX"}}
</script>
</head><body><h1>Open Mic Night Every Tuesday</h1>
<p>Join us weekly. <a href="/contact">Contact</a></p></body></html>`;

const firstParty = extractVenueCandidatesFromPage({
  pageUrl: "https://cactuscafe.org/open-mic",
  html: VENUE_HTML,
  serpTitle: "Open Mic Night Every Tuesday",
});

check("venue's own site is classified first-party", () => {
  assert.equal(firstParty.pageRole, "first_party_venue");
});
check("first-party identity comes from JSON-LD, not the SEO page title", () => {
  assert.equal(firstParty.candidates[0]?.name, "Cactus Cafe");
});
check("first-party identity keeps its structured address", () => {
  assert.equal(firstParty.candidates[0]?.city, "Austin");
  assert.equal(firstParty.candidates[0]?.region, "TX");
});

// A first-party page whose only identity is an SEO title yields nothing to ingest.
const SEO_ONLY_HTML = `<!doctype html><html><head>
<title>Post Your Open Mic</title></head><body><h1>Post Your Open Mic</h1>
<p>Submit your event to our calendar.</p></body></html>`;
const seoOnly = extractVenueCandidatesFromPage({
  pageUrl: "https://badslava.com/post-your-open-mic.php",
  html: SEO_ONLY_HTML,
});
check("a page with only an SEO title produces no venue identity", () => {
  assert.equal(seoOnly.candidates.length, 0);
});

// Real venue sites hide their name in the title tail, the logo, or the domain.
const BRAND_IN_TITLE_TAIL = extractVenueCandidatesFromPage({
  pageUrl: "https://sillygoosememphis.com/",
  html: `<!doctype html><html><head><title>Open Mic Night | Silly Goose Memphis</title></head>
<body><h1>Open Mic Night</h1></body></html>`,
});
check("a brand in the title tail is used as the identity", () => {
  assert.equal(BRAND_IN_TITLE_TAIL.candidates[0]?.name, "Silly Goose Memphis");
});

const BRAND_IN_MARKETING_TITLE = extractVenueCandidatesFromPage({
  pageUrl: "https://www.mortonamphitheater.com/",
  html: `<!doctype html><html><head><title>Morton Amphitheater Tickets &amp; Schedule</title></head>
<body><h1>Welcome</h1></body></html>`,
});
check("marketing tails are stripped to reveal the venue name", () => {
  assert.equal(BRAND_IN_MARKETING_TITLE.candidates[0]?.name, "Morton Amphitheater");
});

const BRAND_IN_LOGO = extractVenueCandidatesFromPage({
  pageUrl: "https://example-venue-site.com/open-mic",
  html: `<!doctype html><html><head><title>Live Music Every Night in Downtown</title></head>
<body><header><a class="site-logo" href="/"><img alt="The Hideout Chicago logo" src="/l.png"></a></header>
<h1>Live Music Every Night</h1></body></html>`,
});
check("logo alt text supplies the identity when the title is a slogan", () => {
  assert.equal(BRAND_IN_LOGO.candidates[0]?.name, "The Hideout Chicago");
});

check("marketing-tail stripping still rejects a pure category title", () => {
  // "Cocktail Bar in Downtown Memphis Open Late" is a description, not a name.
  const desc = extractVenueCandidatesFromPage({
    pageUrl: "https://somebar.com/",
    html: `<!doctype html><html><head><title>Cocktail Bar in Downtown Memphis Open Late</title></head>
<body><h1>Cocktail Bar</h1></body></html>`,
  });
  const names = desc.candidates.map((c) => c.name.toLowerCase());
  assert.equal(
    names.some((n) => n.includes("cocktail bar in downtown")),
    false,
    `description leaked as identity: ${JSON.stringify(names)}`,
  );
});

// ---------------------------------------------------------------------------
// 4. Venue lane requires a Google Place match; host lane does not.
// ---------------------------------------------------------------------------
check("unresolved place resolution is not usable", () => {
  assert.equal(
    placeResolutionIsUsable({ status: "unresolved", placeId: null, lat: null, lng: null }),
    false,
  );
});
check("resolved place without coordinates is not usable", () => {
  assert.equal(
    placeResolutionIsUsable({ status: "resolved", placeId: "abc", lat: null, lng: null }),
    false,
  );
});
check("resolved place with coordinates is usable", () => {
  assert.equal(
    placeResolutionIsUsable({ status: "resolved", placeId: "abc", lat: 30.29, lng: -97.74 }),
    true,
  );
});
check("cached resolutions stay usable so reruns spend no lookups", () => {
  assert.equal(
    placeResolutionIsUsable({ status: "cached_resolved", placeId: "abc", lat: 30.29, lng: -97.74 }),
    true,
  );
});
// Regressions for real bad rows this pipeline produced: a name can match a same-named business
// anywhere, so a US address and an agreeing domain are required.
check("addresses outside the US are not accepted as venues", () => {
  assert.equal(isUnitedStatesAddress("Bucharest, Romania"), false);
  assert.equal(isUnitedStatesAddress("700 S Wabash Ave, Chicago, IL 60605, USA"), true);
  assert.equal(isUnitedStatesAddress("4802 N Broadway, Chicago, IL 60640"), true);
  assert.equal(isUnitedStatesAddress(null), false);
});
check("a candidate's own domain must agree with the Google place website", () => {
  assert.equal(domainsAgree("muse.ai", "musespirits.com"), false);
  assert.equal(domainsAgree("about.meta.com", "metahousemke.org"), false);
  assert.equal(domainsAgree("buddyguy.com", "www.buddyguy.com"), true);
  assert.equal(domainsAgree("shop.cactuscafe.org", "cactuscafe.org"), true);
  assert.equal(domainsAgree(null, "anything.com"), true, "no candidate domain means nothing to contradict");
});

const PLATFORM_LINK_HTML = `<!doctype html><html><head><title>Open Mic Night Roundup</title></head><body>
<h1>Open Mic Night Roundup</h1>
<p><a href="https://www.meta.ai/">Meta AI</a> and <a href="https://about.meta.com/">Meta</a> and
<a href="https://muse.ai/">Muse</a> are not venues.</p>
<p>But <a href="https://buddyguy.com/">Buddy Guy's Legends</a> is.</p>
</body></html>`;
const platformPage = extractVenueCandidatesFromPage({
  pageUrl: "https://exampleblog.com/2024/01/open-mic-roundup",
  html: PLATFORM_LINK_HTML,
});
check("platform links are never venue candidates", () => {
  const names = platformPage.candidates.map((c) => c.name.toLowerCase());
  assert.equal(names.some((n) => n.includes("meta") || n === "muse"), false, `platform leaked: ${JSON.stringify(names)}`);
});
check("a genuine venue link on the same page still survives", () => {
  const names = platformPage.candidates.map((c) => c.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("buddy guy")), `missing venue in ${JSON.stringify(names)}`);
});

check("lookup keys normalize name/city/region so duplicates share a cache row", () => {
  assert.equal(
    placeLookupKey({ name: "The Blue-Note Tavern!", city: "Austin", region: "TX" }),
    placeLookupKey({ name: "the blue note tavern", city: "austin", region: "tx" }),
  );
});

await checkAsync("place lookups are not spent twice on the same candidate", async () => {
  const cacheRow = {
    outcome: "resolved",
    reason: "cached",
    matchScore: 0.9,
    placeId: "place-1",
    canonicalName: "Cactus Cafe",
    formattedAddress: "2247 Guadalupe St, Austin, TX",
    lat: 30.29,
    lng: -97.74,
    website: "https://cactuscafe.org/",
    websiteHost: "cactuscafe.org",
    updatedAt: new Date(),
  };
  let updates = 0;
  const prismaStub = {
    // Hit counting must not touch `updatedAt`, which the daily budget reads as real spend.
    $executeRaw: async () => {
      updates += 1;
      return 1;
    },
    growthPlaceLookup: {
      findUnique: async () => cacheRow,
      update: async () => {
        throw new Error("cache hits must not bump updatedAt");
      },
      upsert: async () => {
        throw new Error("must not write a new lookup when the cache is warm");
      },
    },
  };
  const budget = new PlaceLookupBudget(5);
  const r = await resolveVenueCandidateWithPlaces(
    prismaStub,
    { name: "Cactus Cafe", city: "Austin", region: "TX", streetAddress: null, websiteUrl: null },
    budget,
  );
  assert.equal(r.status, "cached_resolved");
  assert.equal(budget.spentCount, 0, "cache hit must not spend a paid lookup");
  assert.equal(budget.cacheHitCount, 1);
  assert.equal(updates, 1, "cache hit should be counted");
  assert.equal(placeResolutionIsUsable(r), true);
});

await checkAsync("the daily cap shrinks the run budget once today's lookups are used", async () => {
  const perDay = discoveryPlaceLookupsPerDay();
  const exhausted = await createPlaceLookupBudget({
    growthPlaceLookup: { count: async () => perDay },
  });
  assert.equal(exhausted.remaining, 0, "a fully spent day must allow no further paid lookups");

  const fresh = await createPlaceLookupBudget({ growthPlaceLookup: { count: async () => 0 } });
  assert.ok(fresh.remaining > 0 && fresh.remaining <= perDay);
});

await checkAsync("the per-run budget stops paid lookups once exhausted", async () => {
  const prismaStub = { growthPlaceLookup: { findUnique: async () => null } };
  const budget = new PlaceLookupBudget(0);
  const r = await resolveVenueCandidateWithPlaces(
    prismaStub,
    { name: "Some Venue", city: "Austin", region: "TX", streetAddress: null, websiteUrl: null },
    budget,
  );
  assert.ok(["budget_exhausted", "skipped_no_key"].includes(r.status), `unexpected status ${r.status}`);
  assert.equal(placeResolutionIsUsable(r), false);
});

// ---------------------------------------------------------------------------
// 5. Ingest gate: automated venue names are gated, hosts are exempt.
// ---------------------------------------------------------------------------
/**
 * Ingest is gated before it ever touches the database, so `create` throwing a sentinel proves the
 * candidate passed every gate without needing the whole persistence layer stubbed.
 */
const CREATE_REACHED = "CREATE_REACHED";
function prismaCreateStub() {
  return {
    growthLead: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async () => {
        throw new Error(CREATE_REACHED);
      },
    },
    marketingContact: { findFirst: async () => null, findUnique: async () => null },
  };
}

async function ingestOutcome(candidate) {
  try {
    return await ingestGrowthLeadCandidate(prismaCreateStub(), candidate);
  } catch (e) {
    if (e.message === CREATE_REACHED) return { status: "created", id: "stub" };
    throw e;
  }
}

for (const junk of ["Bars & Nightlife in Columbus Ohio", "Post Your Open Mic", "ComedyList", "Types Of Events"]) {
  await checkAsync(`automated VENUE discovery rejects page title ${JSON.stringify(junk)}`, async () => {
    const res = await ingestOutcome({
      leadType: "VENUE",
      name: junk,
      websiteUrl: "https://stepoutcolumbus.com/bars-nightlife/",
      openMicSignalTier: "EXPLICIT_OPEN_MIC",
      sourceKind: "WEBSITE_CONTACT",
    });
    assert.equal(res.status, "skipped");
    assert.match(res.reason, /^venue_name_not_identity:/);
  });
}

await checkAsync("automated VENUE discovery accepts a place-verified venue", async () => {
  const res = await ingestOutcome({
    leadType: "VENUE",
    name: "Cactus Cafe",
    websiteUrl: "https://cactuscafe.org/",
    openMicSignalTier: "EXPLICIT_OPEN_MIC",
    sourceKind: "WEBSITE_CONTACT",
    googlePlaceId: "place-1",
  });
  assert.equal(res.status, "created");
});

await checkAsync("host lane is not subject to the venue name/place gate", async () => {
  // A host brand is not a place and carries no Google Place ID.
  const res = await ingestOutcome({
    leadType: "PROMOTER_ACCOUNT",
    name: "Open Mic Collective",
    websiteUrl: "https://openmiccollective.com/",
    contactEmailNormalized: "host@openmiccollective.com",
    sourceKind: "EVENT_LISTING",
  });
  assert.equal(res.status, "created", `host lane blocked: ${res.reason ?? ""}`);
});

await checkAsync("a place-verified venue with no website still enters as inventory", async () => {
  // Venues named on a directory page without a link have no site to crawl yet; the verified
  // place id is the anchor that keeps them from being dropped.
  const res = await ingestOutcome({
    leadType: "VENUE",
    name: "The Mahaffey Theater",
    city: "St. Petersburg",
    region: "FL",
    openMicSignalTier: "STRONG_LIVE_EVENT",
    sourceKind: "WEBSITE_CONTACT",
    googlePlaceId: "place-mahaffey",
  });
  assert.equal(res.status, "created", `place-verified venue dropped: ${res.reason ?? ""}`);
});

await checkAsync("a venue with neither website, email nor place is still dropped", async () => {
  const res = await ingestOutcome({
    leadType: "VENUE",
    name: "The Mahaffey Theater",
    openMicSignalTier: "STRONG_LIVE_EVENT",
    sourceKind: "WEBSITE_CONTACT",
  });
  assert.equal(res.status, "skipped");
  assert.equal(res.reason, "no_valid_email_for_main_pipeline");
});

await checkAsync("manual admin imports are exempt from the discovery name gate", async () => {
  const res = await ingestOutcome({
    leadType: "VENUE",
    name: "Types Of Events",
    contactEmailNormalized: "owner@realvenue.com",
    websiteUrl: "https://realvenue.com/",
    sourceKind: "MANUAL_ADMIN",
  });
  assert.equal(res.status, "created");
});

// ---------------------------------------------------------------------------
// 6. Duplicates collapse on Google Place ID before any weaker key.
// ---------------------------------------------------------------------------
await checkAsync("same Google place collapses to the existing lead", async () => {
  const seen = [];
  const prismaStub = {
    growthLead: {
      findFirst: async (args) => {
        seen.push(args.where);
        if (args.where.googlePlaceId === "place-1") return { id: "existing-lead" };
        return null;
      },
      findUnique: async () => null,
    },
  };
  const dup = await findExistingGrowthLeadForDedupe(prismaStub, {
    leadType: "VENUE",
    discoveryMarketSlug: "national",
    googlePlaceId: "place-1",
    websiteHostNormalized: "some-other-domain.com",
  });
  assert.deepEqual(dup, { id: "existing-lead", reason: "googlePlaceId" });
  assert.equal(seen[0].googlePlaceId, "place-1", "place id must be checked first");
});

await checkAsync("place dedupe ignores market and domain differences", async () => {
  const prismaStub = {
    growthLead: {
      findFirst: async (args) => (args.where.googlePlaceId ? { id: "existing-lead" } : null),
      findUnique: async () => null,
    },
  };
  const dup = await findExistingGrowthLeadForDedupe(prismaStub, {
    leadType: "VENUE",
    discoveryMarketSlug: "austin-tx",
    googlePlaceId: "place-1",
  });
  assert.equal(dup?.reason, "googlePlaceId");
});

// ---------------------------------------------------------------------------
// 7. Send gate: a machine-discovered venue must resolve to a real place first.
// ---------------------------------------------------------------------------
const { evaluateGrowthLeadOutreachEligibility } = await import("../src/lib/growth/outreachContactEligible.ts");

/** A lead that clears every other send gate, so only the place requirement is under test. */
function sendableVenue(over) {
  return {
    id: "lead-1",
    leadType: "VENUE",
    status: "APPROVED",
    name: "Funhouse Lounge",
    contactEmailNormalized: "info@funhouselounge.com",
    contactEmailConfidence: "HIGH",
    websiteUrl: "https://funhouselounge.com/",
    contactUrl: null,
    websiteHostNormalized: "funhouselounge.com",
    openMicSignalTier: "EXPLICIT_OPEN_MIC",
    sourceKind: "WEBSITE_CONTACT",
    source: "autonomous_web_search_venue_crawl",
    city: "Portland",
    region: "OR",
    ...over,
  };
}

check("an autonomously discovered venue cannot be emailed without a Google Place", () => {
  const res = evaluateGrowthLeadOutreachEligibility(sendableVenue({}));
  assert.equal(res.eligible, false);
  assert.equal(res.reason, "place_unverified");
});

check("the same venue passes the place gate once it resolves", () => {
  const res = evaluateGrowthLeadOutreachEligibility(sendableVenue({ leadGooglePlaceId: "place-funhouse" }));
  assert.notEqual(res.reason, "place_unverified");
});

check("a place on the linked listing satisfies the venue place gate", () => {
  const res = evaluateGrowthLeadOutreachEligibility(sendableVenue({ googlePlaceId: "place-from-listing" }));
  assert.notEqual(res.reason, "place_unverified");
});

check("hosts are exempt: a promoter has no storefront to match", () => {
  const res = evaluateGrowthLeadOutreachEligibility(
    sendableVenue({
      leadType: "PROMOTER_ACCOUNT",
      name: "Open Mic Collective",
      source: "autonomous_host_search_promoter",
    }),
  );
  assert.notEqual(res.reason, "place_unverified");
});

check("curated and imported venues are exempt from the place gate", () => {
  const res = evaluateGrowthLeadOutreachEligibility(
    sendableVenue({ source: "chicagoland_curated_venue", sourceKind: "MANUAL_ADMIN" }),
  );
  assert.notEqual(res.reason, "place_unverified");
});

if (failures.length) {
  console.error(`Discovery quality self-check FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("Discovery quality self-check passed.");
