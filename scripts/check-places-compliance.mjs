/**
 * Google Maps Platform cost + retention regressions.
 *
 * Covers: the billable request shape (IDs-only Text Search, opt-in website field), the venue
 * type gate, what the place cache is allowed to persist, and the retention purge.
 */
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_URL ??= "https://micstage.com";
process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-key";
process.env.GOOGLE_PLACES_API_MODE = "new";

const { PlaceLookupBudget, resolveVenueCandidateWithPlaces, hasVenueLanePlaceType } = await import(
  "../src/lib/growth/discovery/venuePlaceResolution.ts"
);
const { purgeExpiredGoogleMapsContent, googleContentExpiryFrom, GOOGLE_CONTENT_RETENTION_DAYS } =
  await import("../src/lib/compliance/googleMapsContentRetention.ts");
const { titleCaseAddress } = await import("../src/lib/geo/nonGoogleGeocode.ts");

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

const AUSTIN_PLACE = {
  id: "place-cactus",
  displayName: { text: "Cactus Cafe" },
  formattedAddress: "2247 Guadalupe St, Austin, TX 78705, USA",
  location: { latitude: 30.2861, longitude: -97.7414 },
  types: ["bar", "point_of_interest", "establishment"],
  businessStatus: "OPERATIONAL",
  websiteUri: "https://cactuscafe.org/",
  addressComponents: [
    { longText: "Austin", shortText: "Austin", types: ["locality"] },
    { longText: "Texas", shortText: "TX", types: ["administrative_area_level_1"] },
  ],
};

/** Records every outbound Places request so we can assert the billed SKU shape. */
function installFetchStub(place) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, mask: init?.headers?.["X-Goog-FieldMask"] ?? null });
    if (href.includes("places:searchText")) {
      return { ok: true, json: async () => ({ places: [{ id: place.id }] }) };
    }
    if (href.includes("places.googleapis.com/v1/places/")) {
      return { ok: true, json: async () => place };
    }
    throw new Error(`unexpected request: ${href}`);
  };
  return calls;
}

function memoryLedger() {
  const rows = new Map();
  return {
    create: async ({ data }) => {
      if (rows.has(data.idempotencyKey)) {
        const err = new Error("unique");
        throw err;
      }
      rows.set(data.idempotencyKey, { ...data });
      return data;
    },
    findUnique: async ({ where }) => rows.get(where.idempotencyKey) ?? null,
    count: async ({ where }) =>
      [...rows.values()].filter((r) => {
        if (where.sent != null && r.sent !== where.sent) return false;
        if (where.sku && r.sku !== where.sku) return false;
        if (where.dayUtc && r.dayUtc !== where.dayUtc) return false;
        if (where.monthUtc && r.monthUtc !== where.monthUtc) return false;
        return true;
      }).length,
    aggregate: async () => ({
      _sum: {
        estimatedUsdMicros: [...rows.values()].reduce((n, r) => n + (r.sent ? r.estimatedUsdMicros || 0 : 0), 0),
      },
    }),
  };
}

function cachingPrismaStub() {
  const writes = [];
  return {
    writes,
    growthPlaceLookup: {
      findUnique: async () => null,
      update: async () => ({}),
      upsert: async (args) => {
        writes.push(args.create ?? args.update);
        return {};
      },
    },
    placesUsageLedger: memoryLedger(),
  };
}

const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// 1. Billable request shape.
// ---------------------------------------------------------------------------
await checkAsync("text search asks for ids only and details omits website by default", async () => {
  const calls = installFetchStub(AUSTIN_PLACE);
  const prisma = cachingPrismaStub();
  const r = await resolveVenueCandidateWithPlaces(
    prisma,
    { name: "Cactus Cafe", city: "Austin", region: "TX", streetAddress: null, websiteUrl: null },
    new PlaceLookupBudget(5),
  );
  assert.notEqual(r.status, "resolved", "ids-only discovery must not treat a search hit as a paid identity match");
  assert.equal(r.placeId, "place-cactus");

  const search = calls.find((c) => c.url.includes("places:searchText"));
  assert.ok(search, "no Text Search request was made");
  assert.equal(search.mask, "places.id", "Text Search must stay on the free IDs-only SKU");

  const details = calls.find((c) => c.url.includes("/v1/places/") && !c.url.includes("searchText"));
  assert.equal(details, undefined, "discovery must not buy Place Details");
});

await checkAsync("candidate websites do not trigger Enterprise websiteUri", async () => {
  const calls = installFetchStub(AUSTIN_PLACE);
  await resolveVenueCandidateWithPlaces(
    cachingPrismaStub(),
    {
      name: "Cactus Cafe",
      city: "Austin",
      region: "TX",
      streetAddress: null,
      websiteUrl: "https://cactuscafe.org/open-mic",
    },
    new PlaceLookupBudget(5),
  );
  const details = calls.find((c) => c.url.includes("/v1/places/") && !c.url.includes("searchText"));
  assert.equal(details, undefined, "websiteUri must not be requested in background discovery");
});

// ---------------------------------------------------------------------------
// 2. Venue type gate: a real business that cannot host an open mic is rejected.
// ---------------------------------------------------------------------------
check("hospitality and performance types pass the venue lane", () => {
  assert.equal(hasVenueLanePlaceType(["bar", "establishment"]), true);
  assert.equal(hasVenueLanePlaceType(["cafe"]), true);
  assert.equal(hasVenueLanePlaceType(["performing_arts_theater"]), true);
});
check("generic establishment types alone do not pass", () => {
  assert.equal(hasVenueLanePlaceType(["point_of_interest", "establishment"]), false);
  assert.equal(hasVenueLanePlaceType([]), false);
  assert.equal(hasVenueLanePlaceType(null), false);
});

await checkAsync("a production company matching by name is rejected, not created", async () => {
  installFetchStub({
    ...AUSTIN_PLACE,
    id: "place-productions",
    displayName: { text: "Dick Clark Productions Inc" },
    types: ["point_of_interest", "establishment"],
    formattedAddress: "2900 W Alameda Ave, Burbank, CA 91505, USA",
    addressComponents: [
      { longText: "Burbank", shortText: "Burbank", types: ["locality"] },
      { longText: "California", shortText: "CA", types: ["administrative_area_level_1"] },
    ],
  });
  const r = await resolveVenueCandidateWithPlaces(
    cachingPrismaStub(),
    { name: "Dick Clark Productions Inc", city: "Burbank", region: "CA", streetAddress: null, websiteUrl: null },
    new PlaceLookupBudget(5),
  );
  assert.equal(r.status, "unresolved", `ids-only path stores the id without a type verdict, got ${r.status}`);
  assert.equal(r.placeId, "place-productions");
});

// ---------------------------------------------------------------------------
// 3. What the cache may persist.
// ---------------------------------------------------------------------------
await checkAsync("the place cache stores no Google business name, address or website", async () => {
  installFetchStub(AUSTIN_PLACE);
  const prisma = cachingPrismaStub();
  await resolveVenueCandidateWithPlaces(
    prisma,
    { name: "Cactus Cafe", city: "Austin", region: "TX", streetAddress: null, websiteUrl: null },
    new PlaceLookupBudget(5),
  );
  const written = prisma.writes.at(-1);
  assert.ok(written, "nothing was cached");
  assert.equal(written.canonicalName, null, "Google business names have no retention grant");
  assert.equal(written.formattedAddress, null, "Google addresses have no retention grant");
  assert.equal(written.website, null, "Google websites have no retention grant");
  assert.equal(written.websiteHost, null);
  assert.equal(written.placeId, "place-cactus", "place ids may be retained indefinitely");
  assert.equal(written.coordsVerified, false);
  assert.equal(written.lat, null);
});

await checkAsync("ids-only cache does not retain Google coordinates", async () => {
  installFetchStub(AUSTIN_PLACE);
  const prisma = cachingPrismaStub();
  await resolveVenueCandidateWithPlaces(
    prisma,
    { name: "Cactus Cafe", city: "Austin", region: "TX", streetAddress: null, websiteUrl: null },
    new PlaceLookupBudget(5),
  );
  const written = prisma.writes.at(-1);
  assert.equal(written.lat, null);
  assert.equal(written.lng, null);
  assert.equal(written.googleContentExpiresAt, null);
});

check("the retention window is 30 days", () => {
  const days = (googleContentExpiryFrom(new Date()).getTime() - Date.now()) / 86_400_000;
  assert.ok(Math.abs(days - 30) < 0.01, `expected 30 days, got ${days}`);
});

globalThis.fetch = originalFetch;

// ---------------------------------------------------------------------------
// 4. Retention purge keeps the place id and drops expired content.
// ---------------------------------------------------------------------------
await checkAsync("purge clears expired content but keeps place ids and match scores", async () => {
  const updates = { lookups: null, leads: null, listings: null };
  const prismaStub = {
    growthPlaceLookup: {
      findMany: async () => [{ id: "row-1" }],
      updateMany: async (args) => {
        updates.lookups = args.data;
        return { count: 1 };
      },
    },
    growthLead: {
      updateMany: async (args) => {
        updates.leads = args.data;
        return { count: 2 };
      },
    },
    publicOpenMicListing: {
      updateMany: async (args) => {
        updates.listings = args.data;
        return { count: 3 };
      },
    },
  };

  const res = await purgeExpiredGoogleMapsContent(prismaStub);
  assert.deepEqual(res, {
    placeLookupRowsPurged: 1,
    growthLeadRowsPurged: 2,
    listingCoordinateRowsPurged: 3,
  });

  for (const field of ["canonicalName", "formattedAddress", "website", "websiteHost", "lat", "lng"]) {
    assert.equal(updates.lookups[field], null, `${field} must be purged`);
  }
  assert.equal("placeId" in updates.lookups, false, "the place id must survive the purge");
  assert.equal("matchScore" in updates.lookups, false, "our own match score is not Google content");
  assert.equal("coordsVerified" in updates.lookups, false, "our own derived flag must survive");

  for (const field of ["placeCanonicalName", "placeFormattedAddress", "placeLat", "placeLng"]) {
    assert.equal(updates.leads[field], null, `lead ${field} must be purged`);
  }
  assert.equal("googlePlaceId" in updates.leads, false, "lead place id must survive");

  assert.equal(updates.listings.lat, null);
  assert.equal(updates.listings.lng, null);
  assert.equal(updates.listings.coordSource, null);
});

// ---------------------------------------------------------------------------
// 5. Non-Google geocoding output is presentable.
// ---------------------------------------------------------------------------
check("census addresses are title-cased for display", () => {
  assert.equal(
    titleCaseAddress("2247 GUADALUPE ST, AUSTIN, TX, 78705"),
    "2247 Guadalupe St, Austin, TX, 78705",
  );
  assert.equal(titleCaseAddress("4802 N BROADWAY, CHICAGO, IL, 60640"), "4802 N Broadway, Chicago, IL, 60640");
});

if (failures.length) {
  console.error(`Places compliance self-check FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("Places compliance self-check passed.");
