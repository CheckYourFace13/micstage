/**
 * Host/promoter discovery lane regressions.
 *
 * Covers: organizer extraction from JSON-LD, "hosted by" text extraction with link capture,
 * rejection of publisher/directory/generic host names, host lead creation with no email yet, and
 * multi-venue tagging once a brand appears at 2+ venues.
 *
 * Run: npm run test:host-discovery-lane
 */
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_URL ??= "https://micstage.com";

const { extractHostOrganizersFromPage } = await import(
  "../src/lib/growth/discovery/hostOrganizerExtraction.ts"
);
const { classifyHostName, isUsableHostName, isMineableHostUrl, hostNameDuplicatesVenue } = await import(
  "../src/lib/growth/hostNameQuality.ts"
);
const { ingestHostLaneLeadCandidate, isHostLaneCandidate, resolveHostCrawlUrl } = await import(
  "../src/lib/growth/hostLeadIngest.ts"
);
const { groupVenueRowsByHostBrand, sweepHostMultiVenueProspects } = await import(
  "../src/lib/growth/hostMultiVenueSweep.ts"
);
const { hostLaneSerpCallAllowance } = await import(
  "../src/lib/growth/discovery/autonomousHostSearchAdapter.ts"
);

const failures = [];
function check(label, fn) {
  try {
    fn();
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
  }
}

const names = (extraction) => extraction.candidates.map((c) => c.name);

// ---------------------------------------------------------------------------
// 1. JSON-LD Event.organizer is the strongest host signal.
// ---------------------------------------------------------------------------
const JSONLD_HTML = `<!doctype html><html><head>
<title>Open Mic Night | The Green Mill</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"Weekly Open Mic",
 "location":{"@type":"BarOrPub","name":"The Green Mill"},
 "organizer":{"@type":"Organization","name":"Marvin Comedy Productions",
   "url":"https://marvincomedy.com/","email":"booking@marvincomedy.com"},
 "performer":{"@type":"Person","name":"Jane Smith"}}
</script>
</head><body><h1>Open Mic Night</h1><p>Every Tuesday, sign up at 7pm.</p></body></html>`;

const jsonLd = extractHostOrganizersFromPage({
  pageUrl: "https://greenmilljazz.com/events/open-mic",
  html: JSONLD_HTML,
  venueName: "The Green Mill",
});

check("JSON-LD page is recognized as carrying open-mic evidence", () => {
  assert.equal(jsonLd.hasOpenMicEvidence, true);
});
check("JSON-LD Event.organizer becomes a host candidate", () => {
  assert.ok(
    names(jsonLd).includes("Marvin Comedy Productions"),
    `missing organizer in ${JSON.stringify(names(jsonLd))}`,
  );
});
check("the organizer keeps its own url and structured email", () => {
  const host = jsonLd.candidates.find((c) => c.name === "Marvin Comedy Productions");
  assert.equal(host.websiteUrl, "https://marvincomedy.com/");
  assert.equal(host.email, "booking@marvincomedy.com");
  assert.equal(host.method, "jsonld_event_organizer");
});
check("the venue hosting the event never becomes a host lead", () => {
  assert.equal(
    names(jsonLd).some((n) => n.toLowerCase().includes("green mill")),
    false,
    `venue leaked into host candidates: ${JSON.stringify(names(jsonLd))}`,
  );
});
check("a bare performer name with no host evidence is rejected", () => {
  assert.equal(names(jsonLd).includes("Jane Smith"), false);
  assert.ok(
    jsonLd.rejected.some((r) => r.name === "Jane Smith" && r.reason === "person_name_without_host_evidence"),
    `expected performer rejection, got ${JSON.stringify(jsonLd.rejected)}`,
  );
});

// A page with no open-mic evidence must yield nothing, however many organizers it names.
const NO_EVIDENCE_HTML = `<!doctype html><html><head><title>Trivia Night</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"Trivia Tuesday",
 "organizer":{"@type":"Organization","name":"Quiz Masters Collective","url":"https://quizmasters.com/"}}
</script></head><body><p>Trivia every Tuesday.</p></body></html>`;
check("a page without open-mic evidence produces no host candidates", () => {
  const r = extractHostOrganizersFromPage({ pageUrl: "https://somebar.com/trivia", html: NO_EVIDENCE_HTML });
  assert.equal(r.hasOpenMicEvidence, false);
  assert.equal(r.candidates.length, 0);
});

// ---------------------------------------------------------------------------
// 2. "hosted by X" in body text, with the host's link captured from the anchor.
// ---------------------------------------------------------------------------
const HOSTED_BY_HTML = `<!doctype html><html><head><title>Wednesday Open Mic</title></head><body>
<h1>Wednesday Open Mic</h1>
<p>Our open mic runs every Wednesday at 8pm, hosted by
<a href="https://laughcircuit.com/about">Laugh Circuit</a>. All performers welcome.</p>
<p>Sign up sheet opens at 7:30. <a href="/contact">Contact</a></p>
</body></html>`;

const hostedBy = extractHostOrganizersFromPage({
  pageUrl: "https://thecellarbar.com/open-mic",
  html: HOSTED_BY_HTML,
  venueName: "The Cellar Bar",
});
check('"hosted by X" yields X as a host candidate', () => {
  assert.ok(names(hostedBy).includes("Laugh Circuit"), `got ${JSON.stringify(names(hostedBy))}`);
});
check("the anchor wrapping the host name supplies the host's link", () => {
  const host = hostedBy.candidates.find((c) => c.name === "Laugh Circuit");
  assert.equal(host.websiteUrl, "https://laughcircuit.com/about");
  assert.equal(host.method, "text_hosted_by");
});
check("the host evidence snippet quotes the page", () => {
  const host = hostedBy.candidates.find((c) => c.name === "Laugh Circuit");
  assert.match(host.evidenceSnippet, /hosted by/i);
});

const PRESENTS_HTML = `<!doctype html><html><head><title>Open Mic</title></head><body>
<p>Bad Dog Collective presents open mic night, every Monday at 8pm. Sign up early.</p>
</body></html>`;
check('"X presents" yields X as a host candidate', () => {
  const r = extractHostOrganizersFromPage({ pageUrl: "https://barsite.com/mic", html: PRESENTS_HTML });
  assert.ok(names(r).includes("Bad Dog Collective"), `got ${JSON.stringify(names(r))}`);
});

// A host phrase far from any open-mic evidence is about something else on the page.
const FAR_PHRASE_HTML = `<!doctype html><html><head><title>Open Mic Night</title></head><body>
<p>Open mic every Thursday at 8pm.</p>
<p>${"Filler copy about our kitchen and beer list. ".repeat(40)}</p>
<p>Our wedding packages are hosted by Elegant Events Group.</p>
</body></html>`;
check("a host phrase far from the open-mic evidence is rejected", () => {
  const r = extractHostOrganizersFromPage({ pageUrl: "https://barsite.com/events", html: FAR_PHRASE_HTML });
  assert.equal(names(r).includes("Elegant Events Group"), false, `got ${JSON.stringify(names(r))}`);
  assert.ok(r.rejected.some((x) => x.reason === "host_phrase_not_near_open_mic_evidence"));
});

// ---------------------------------------------------------------------------
// 3. Publisher / directory / generic names are never host identities.
// ---------------------------------------------------------------------------
const REJECT_HOST_NAMES = [
  "Top 10 Open Mics in Chicago",
  "The 15 Best Open Mics in Austin",
  "Chicago Sun-Times",
  "Austin Music Guide",
  "ComedyList",
  "OpenMicFinder",
  "Open Mic Night",
  "Open Mic",
  "The Host",
  "Your Host",
  "Sign Up",
  "Sign up",
  "Contact Us",
  "Events",
  "@mikesopenmic",
  "mikes_open_mic",
  "https://example.com/open-mic",
  "Best Open Mic Nights Near Me",
  "Greater Austin Chamber of Commerce",
  "Open Mics Near Me",
  "Productions",
  "Drummer",
  "Icon",
  "CHAT ROOMS Wednesday",
  "Andrew GleasonCLICK HERE TO UPDATE",
  "Jae Mannion Date Monday",
  "Choose Chicago — events hub",
  "Auditorium Theatre events",
  "Organization",
];
for (const name of REJECT_HOST_NAMES) {
  check(`rejects host name ${JSON.stringify(name)}`, () => {
    assert.equal(isUsableHostName(name), false, `accepted with reason ${classifyHostName(name)}`);
  });
}

const ALLOW_HOST_NAMES = [
  "Marvin Comedy Productions",
  "Laugh Circuit",
  "Bad Dog Collective",
  "Lincoln Square Open Mic",
  "Comedy Clubhouse Open Mic",
  "Chuckleheads Entertainment Group",
  "Sarah Delgado",
];
for (const name of ALLOW_HOST_NAMES) {
  check(`allows host name ${JSON.stringify(name)}`, () => {
    assert.equal(isUsableHostName(name), true, `rejected as ${classifyHostName(name)}`);
  });
}

// The publisher of an article about open mics is not the host.
const PUBLISHER_HTML = `<!doctype html><html><head>
<title>Queer comedy open mic filled a void | Chicago Sun-Times</title>
<meta property="og:site_name" content="Chicago Sun-Times">
</head><body>
<p>The weekly open mic is presented by Chicago Sun-Times readers every Monday.</p>
</body></html>`;
check("the publishing newspaper is never extracted as a host", () => {
  const r = extractHostOrganizersFromPage({
    pageUrl: "https://chicago.suntimes.com/2024/10/18/queer-comedy-open-mic",
    html: PUBLISHER_HTML,
  });
  assert.equal(
    names(r).some((n) => n.toLowerCase().includes("sun-times")),
    false,
    `publisher leaked: ${JSON.stringify(names(r))}`,
  );
});

check("a host brand that just restates the venue is rejected", () => {
  assert.equal(hostNameDuplicatesVenue("Green Mill Open Mic", "The Green Mill"), true);
  assert.equal(hostNameDuplicatesVenue("Laugh Circuit", "The Green Mill"), false);
});

check("directories and social platforms are not mineable host sites", () => {
  assert.equal(isMineableHostUrl("https://www.eventbrite.com/e/12345"), false);
  assert.equal(isMineableHostUrl("https://www.facebook.com/laughcircuit"), false);
  assert.equal(isMineableHostUrl("https://instagram.com/laughcircuit"), false);
  assert.equal(isMineableHostUrl("https://laughcircuit.com/about"), true);
  assert.equal(isMineableHostUrl(null), false);
});

// ---------------------------------------------------------------------------
// 4. Host leads are created before they have an email.
// ---------------------------------------------------------------------------
const CREATE_REACHED = "CREATE_REACHED";

function hostPrismaStub(overrides = {}) {
  return {
    growthLead: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async ({ data }) => {
        const err = new Error(CREATE_REACHED);
        err.data = data;
        throw err;
      },
      update: async () => ({}),
      ...overrides,
    },
    marketingContact: { findFirst: async () => null, findUnique: async () => null },
  };
}

async function hostIngestOutcome(candidate, opts) {
  try {
    return { result: await ingestHostLaneLeadCandidate(hostPrismaStub(), candidate, opts), data: null };
  } catch (e) {
    if (e.message === CREATE_REACHED) return { result: { status: "created", id: "stub" }, data: e.data };
    throw e;
  }
}

const emaillessHostCandidate = {
  leadType: "PROMOTER_ACCOUNT",
  name: "Marvin Comedy Productions",
  websiteUrl: "https://marvincomedy.com/",
  sourceKind: "EVENT_LISTING",
  source: "autonomous_host_search_promoter",
  openMicSignalTier: "EXPLICIT_OPEN_MIC",
  discoveryHints: { hostOutreachLane: true, hostBrand: "Marvin Comedy Productions" },
};

check("host-lane candidates are routed away from the venue-shaped ingest", () => {
  assert.equal(isHostLaneCandidate(emaillessHostCandidate), true);
  assert.equal(
    isHostLaneCandidate({ ...emaillessHostCandidate, leadType: "VENUE" }),
    false,
  );
  assert.equal(isHostLaneCandidate({ ...emaillessHostCandidate, discoveryHints: {} }), false);
});

await checkAsync("a host lead is created with no email once it has a crawlable host site", async () => {
  const { result, data } = await hostIngestOutcome(emaillessHostCandidate);
  assert.equal(result.status, "created", `blocked: ${result.reason ?? ""}`);
  assert.equal(data.leadType, "PROMOTER_ACCOUNT");
  assert.equal(data.status, "DISCOVERED");
  assert.equal(data.contactEmailNormalized ?? null, null, "an emailless host lead must carry no contact");
  assert.equal(
    data.websiteHostNormalized,
    "marvincomedy.com",
    "the host domain is what enrichment later mines for a mailbox",
  );
});

await checkAsync("a host lead without any crawlable host site is not created", async () => {
  const { result } = await hostIngestOutcome({
    ...emaillessHostCandidate,
    websiteUrl: "https://www.eventbrite.com/e/98765",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "host_lead_no_mineable_host_url");
});

await checkAsync("a host lead never inherits the venue's own domain", async () => {
  const { result } = await hostIngestOutcome(
    { ...emaillessHostCandidate, websiteUrl: "https://greenmilljazz.com/open-mic" },
    { excludeWebsiteHosts: ["https://greenmilljazz.com/"] },
  );
  assert.equal(result.status, "skipped", "the venue domain would mine the venue's mailbox");
  assert.equal(result.reason, "host_lead_no_mineable_host_url");
});

await checkAsync("a page-title host name is rejected before any write", async () => {
  const { result } = await hostIngestOutcome({
    ...emaillessHostCandidate,
    name: "Top 10 Open Mics in Chicago",
  });
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /^host_name_not_identity:/);
});

await checkAsync("an existing host on the same domain folds into that lead", async () => {
  const prisma = hostPrismaStub({
    findFirst: async (args) => (args.where.websiteHostNormalized === "marvincomedy.com" ? { id: "host-1" } : null),
    findUnique: async () => ({ discoveryHints: {} }),
  });
  const result = await ingestHostLaneLeadCandidate(prisma, emaillessHostCandidate);
  assert.equal(result.status, "duplicate");
  assert.equal(result.existingId, "host-1");
});

check("host crawl url resolution prefers the host's own site", () => {
  assert.equal(
    resolveHostCrawlUrl({ websiteUrl: null, contactUrl: "https://laughcircuit.com/contact" })?.host,
    "laughcircuit.com",
  );
  assert.equal(resolveHostCrawlUrl({ websiteUrl: "https://facebook.com/x", contactUrl: null }), null);
});

// ---------------------------------------------------------------------------
// 5. Multi-venue detection: a brand at 2+ venues is a multi-venue prospect.
// ---------------------------------------------------------------------------
const venueRows = [
  {
    id: "v1",
    name: "The Cellar Bar",
    city: "Chicago",
    region: "IL",
    discoveryMarketSlug: "chicago-il",
    websiteHostNormalized: "cellarbar.com",
    discoveryHints: { hostBrand: "Laugh Circuit", hostWebsiteUrl: "https://laughcircuit.com/" },
  },
  {
    id: "v2",
    name: "Northside Taproom",
    city: "Chicago",
    region: "IL",
    discoveryMarketSlug: "chicago-il",
    websiteHostNormalized: "northsidetaproom.com",
    discoveryHints: { hostBrand: "laugh circuit" },
  },
  {
    id: "v3",
    name: "Uptown Cafe",
    city: "Chicago",
    region: "IL",
    discoveryMarketSlug: "chicago-il",
    websiteHostNormalized: "uptowncafe.com",
    discoveryHints: { hostBrand: "Solo Series Only Here" },
  },
  {
    id: "v4",
    name: "Random Bar",
    city: "Chicago",
    region: "IL",
    discoveryMarketSlug: "chicago-il",
    websiteHostNormalized: "randombar.com",
    discoveryHints: { hostBrand: "Open Mic Night" },
  },
];

check("host brands group case-insensitively across venues", () => {
  const groups = groupVenueRowsByHostBrand(venueRows);
  const laugh = groups.get("laugh circuit");
  assert.ok(laugh, `missing brand group in ${JSON.stringify([...groups.keys()])}`);
  assert.equal(laugh.venueIds.size, 2);
  assert.equal(laugh.hostUrl, "https://laughcircuit.com/");
});
check("a generic brand hint is never grouped as a host", () => {
  const groups = groupVenueRowsByHostBrand(venueRows);
  assert.equal(groups.has("open mic night"), false);
});

await checkAsync("the sweep tags a brand seen at 2+ venues and leaves single-venue brands alone", async () => {
  const hints = new Map(venueRows.map((r) => [r.id, { ...r.discoveryHints }]));
  const updates = [];
  const auditPayloads = [];
  let page = 0;

  const prisma = {
    operationalRuntimeSetting: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    growthLead: {
      findMany: async () => (page++ === 0 ? venueRows : []),
      findFirst: async (args) =>
        args.where.leadType === "PROMOTER_ACCOUNT" && /laugh circuit/i.test(args.where.name?.equals ?? "")
          ? { id: "host-laugh" }
          : null,
      findUnique: async ({ where }) => ({ discoveryHints: hints.get(where.id) ?? {} }),
      update: async ({ where, data }) => {
        updates.push({ id: where.id, hints: data.discoveryHints });
        hints.set(where.id, data.discoveryHints);
        return {};
      },
    },
    marketingEvent: {
      findFirst: async () => null,
      create: async ({ data }) => {
        auditPayloads.push(data.payload);
        return {};
      },
    },
  };

  const result = await sweepHostMultiVenueProspects(prisma, { maxRows: 500 });
  assert.equal(result.scanned, venueRows.length);
  assert.equal(result.multiVenueBrands, 1, "only the 2-venue brand qualifies");
  assert.equal(result.venuesTagged, 2);
  assert.equal(result.promoterLeadsUpdated, 1, "the promoter lead's hints must be refreshed");
  assert.equal(result.auditEventsCreated, 1);

  const promoterUpdate = updates.find((u) => u.id === "host-laugh");
  assert.ok(promoterUpdate, `promoter lead was not updated: ${JSON.stringify(updates.map((u) => u.id))}`);
  assert.equal(promoterUpdate.hints.hostMultiVenueProspect, true);
  assert.equal(promoterUpdate.hints.hostMultiVenueCount, 2);
  assert.equal(promoterUpdate.hints.hostOutreachLane, true);

  const taggedVenueIds = updates.filter((u) => u.id.startsWith("v")).map((u) => u.id).sort();
  assert.deepEqual(taggedVenueIds, ["v1", "v2"]);
  assert.equal(updates.some((u) => u.id === "v3" || u.id === "v4"), false);
  assert.equal(auditPayloads[0].venueCount, 2);
});

await checkAsync("the sweep refreshes a stale venue count instead of freezing it", async () => {
  const rows = [
    { ...venueRows[0], discoveryHints: { hostBrand: "Laugh Circuit", hostMultiVenueCount: 2 } },
    { ...venueRows[1], discoveryHints: { hostBrand: "Laugh Circuit", hostMultiVenueCount: 2 } },
    {
      id: "v5",
      name: "Third Venue",
      city: "Chicago",
      region: "IL",
      discoveryMarketSlug: "chicago-il",
      websiteHostNormalized: "thirdvenue.com",
      discoveryHints: { hostBrand: "Laugh Circuit", hostMultiVenueCount: 2 },
    },
  ];
  const updates = [];
  let page = 0;
  const prisma = {
    operationalRuntimeSetting: { findUnique: async () => null, upsert: async () => ({}) },
    growthLead: {
      findMany: async () => (page++ === 0 ? rows : []),
      findFirst: async () => null,
      findUnique: async ({ where }) => ({
        discoveryHints: rows.find((r) => r.id === where.id)?.discoveryHints ?? {},
      }),
      update: async ({ where, data }) => {
        updates.push({ id: where.id, hints: data.discoveryHints });
        return {};
      },
    },
    marketingEvent: { findFirst: async () => ({ id: "audit-1" }), create: async () => ({}) },
  };
  const result = await sweepHostMultiVenueProspects(prisma, { maxRows: 500 });
  assert.equal(result.multiVenueBrands, 1);
  assert.equal(result.venuesTagged, 3);
  assert.ok(
    updates.every((u) => u.hints.hostMultiVenueCount === 3),
    `counts not refreshed: ${JSON.stringify(updates.map((u) => u.hints.hostMultiVenueCount))}`,
  );
  assert.equal(result.auditEventsCreated, 0, "an existing audit event must not be duplicated");
});

// ---------------------------------------------------------------------------
// 6. The host lane must not starve the venue lane's search budget.
// ---------------------------------------------------------------------------
check("the host lane only spends search calls that exceed the venue-lane reserve", () => {
  assert.equal(
    hostLaneSerpCallAllowance({ requested: 3, callsToday: 0, dailyAllocation: 40, venueLaneReserve: 12 }),
    3,
  );
  assert.equal(
    hostLaneSerpCallAllowance({ requested: 3, callsToday: 30, dailyAllocation: 40, venueLaneReserve: 12 }),
    0,
    "no headroom left once the venue reserve is accounted for",
  );
  assert.equal(
    hostLaneSerpCallAllowance({ requested: 3, callsToday: 27, dailyAllocation: 40, venueLaneReserve: 12 }),
    1,
    "partial headroom yields a partial allowance",
  );
  assert.equal(
    hostLaneSerpCallAllowance({ requested: 3, callsToday: 0, dailyAllocation: 0, venueLaneReserve: 12 }),
    0,
    "a paused/exhausted quota gives the host lane nothing",
  );
  assert.equal(
    hostLaneSerpCallAllowance({ requested: 3, callsToday: 0, dailyAllocation: null, venueLaneReserve: 12 }),
    0,
  );
});

if (failures.length) {
  console.error(
    `Host discovery lane self-check FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n"),
  );
  process.exit(1);
}
console.log("Host discovery lane self-check passed.");
