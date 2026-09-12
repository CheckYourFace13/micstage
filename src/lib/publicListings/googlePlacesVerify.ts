import type { PrismaClient, PublicListingVerificationStatus } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import {
  evaluateOpenMicEvidence,
  extractDiscoverySnippet,
  OPEN_MIC_EVIDENCE_REASON,
  type OpenMicEvidenceInput,
} from "@/lib/publicListings/openMicEvidence";
import { sendListingClaimInviteIfNeeded } from "@/lib/publicListings/listingClaimInviteEmail";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { submitUrlsToIndexNow } from "@/lib/seo/searchEnginePing";

type GoogleTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
  business_status?: string;
};

type GooglePlaceDetailsResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
  business_status?: string;
  website?: string;
  url?: string;
  address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
};

/** Normalized place shape so legacy and Places API (New) responses share one evaluator. */
type PlaceRecord = {
  placeId?: string;
  name?: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  types?: string[];
  businessStatus?: string;
  website?: string;
  addressComponents?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
};

type PlacesApiMode = "new" | "legacy" | "auto";

/**
 * Places API (New) bills the single highest field-mask tier per request, while the legacy
 * endpoints bill the base SKU plus every data SKU the response could contain. An IDs-only
 * Text Search (New) is free and unmetered, and a details call without `websiteUri` stays in
 * the Pro tier, so the new API is both cheaper and easier to keep inside the free allowance.
 */
function placesApiMode(): PlacesApiMode {
  const raw = process.env.GOOGLE_PLACES_API_MODE?.trim().toLowerCase();
  if (raw === "new" || raw === "legacy") return raw;
  return "auto";
}

/** Details fields we can justify requesting. `websiteUri` is Enterprise-tier, so it is opt-in. */
const NEW_DETAILS_FIELD_MASK_BASE = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "businessStatus",
  "addressComponents",
].join(",");

/** Set when the new API is unavailable to this project so we stop paying the failure latency. */
let newPlacesApiUnavailable = false;

const placesRequestCounters = {
  newTextSearch: 0,
  newDetails: 0,
  newDetailsWithWebsite: 0,
  legacyTextSearch: 0,
  legacyDetails: 0,
  legacyDetailsWithWebsite: 0,
  fallbacks: 0,
};

/** Per-process request tally by billable shape; used by the Places cost audit. */
export function placesRequestStats(): Readonly<typeof placesRequestCounters> {
  return { ...placesRequestCounters };
}

export type GooglePlaceVerifyOutcome = "verified" | "needs_review" | "outdated" | "skipped";

export type GooglePlaceVerifyResult = {
  outcome: GooglePlaceVerifyOutcome;
  reason: string;
  matchScore?: number;
  placeId?: string;
  placeName?: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  city?: string;
  region?: string;
  website?: string;
  /** Google place types, used by the discovery lane to require a hospitality/venue business. */
  types?: string[];
};

export type BatchGoogleVerifyResult = {
  verified: number;
  needsReview: number;
  outdated: number;
  skipped: number;
  noApiKey: boolean;
};

const NON_VENUE_TYPES = new Set([
  "locality",
  "political",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "route",
  "street_address",
  "postal_code",
  "premise",
  "subpremise",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
]);

const VENUE_TYPES = new Set([
  "bar",
  "night_club",
  "restaurant",
  "cafe",
  "food",
  "store",
  "art_gallery",
  "museum",
  "church",
  "university",
  "lodging",
  "establishment",
  "point_of_interest",
]);

let warnedAboutPublicKeyFallback = false;

/**
 * Key for server-side Places calls. A dedicated server key is strongly preferred: the browser
 * key is shipped to clients and can only be protected by HTTP-referrer restrictions, which do
 * not apply to server requests — so a referrer-restricted browser key would break these calls,
 * and an unrestricted one is abusable by anyone who reads our JavaScript. The fallback exists
 * only so verification keeps working until `GOOGLE_MAPS_SERVER_API_KEY` is set.
 */
export function googleMapsServerApiKey(): string | null {
  const serverKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (serverKey) return serverKey;

  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (publicKey && !warnedAboutPublicKeyFallback) {
    warnedAboutPublicKeyFallback = true;
    console.warn(
      "[google places] using NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for server calls; set GOOGLE_MAPS_SERVER_API_KEY (IP-restricted, Places-only) instead",
    );
  }
  return publicKey || null;
}

/** True when server Places calls are running on the browser key (surfaced in ops audits). */
export function usingPublicKeyForServerPlaces(): boolean {
  const hasServerKey = Boolean(
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim(),
  );
  return !hasServerKey && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|llc|inc|ltd|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;

  const ta = na.split(" ").filter((t) => t.length > 2);
  const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (ta.length === 0 || tb.size === 0) return 0;

  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  return overlap / Math.max(ta.length, tb.size);
}

function regionMatches(listingRegion: string | null | undefined, placeRegion: string | undefined): boolean {
  if (!listingRegion?.trim() || !placeRegion?.trim()) return true;
  const lr = listingRegion.trim().toLowerCase();
  const pr = placeRegion.trim().toLowerCase();
  return lr === pr || lr.startsWith(pr) || pr.startsWith(lr);
}

function cityMatches(listingCity: string | null | undefined, placeCity: string | undefined): boolean {
  if (!listingCity?.trim() || !placeCity?.trim()) return true;
  const lc = listingCity.trim().toLowerCase();
  const pc = placeCity.trim().toLowerCase();
  return lc === pc || lc.includes(pc) || pc.includes(lc);
}

function parseAddressComponents(components: GooglePlaceDetailsResult["address_components"]): {
  city?: string;
  region?: string;
} {
  if (!components?.length) return {};
  const get = (type: string) =>
    components.find((c) => c.types?.includes(type))?.short_name ??
    components.find((c) => c.types?.includes(type))?.long_name;

  return {
    city: get("locality") ?? get("postal_town") ?? get("administrative_area_level_2"),
    region: get("administrative_area_level_1"),
  };
}

function classifyPlaceTypes(types: string[] | undefined): "venue" | "non_venue" | "unknown" {
  if (!types?.length) return "unknown";
  if (types.some((t) => NON_VENUE_TYPES.has(t)) && !types.some((t) => VENUE_TYPES.has(t))) {
    return "non_venue";
  }
  if (types.some((t) => VENUE_TYPES.has(t))) return "venue";
  return "unknown";
}

function buildSearchQuery(listing: {
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
}): string {
  const city = listing.city?.trim();
  const region = listing.region?.trim();
  if (city && region) return `${listing.name}, ${city}, ${region}`;
  if (city) return `${listing.name}, ${city}`;
  return listing.formattedAddress.trim() || listing.name.trim();
}

async function googleFetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; results?: unknown[]; result?: unknown };
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("[google places verify] API status", data.status);
    return null;
  }
  return data as T;
}

function legacyToRecord(place: GoogleTextSearchResult | GooglePlaceDetailsResult): PlaceRecord {
  return {
    placeId: place.place_id,
    name: place.name,
    formattedAddress: place.formatted_address,
    lat: place.geometry?.location?.lat,
    lng: place.geometry?.location?.lng,
    types: place.types,
    businessStatus: place.business_status,
    website: "website" in place ? place.website : undefined,
    addressComponents: "address_components" in place ? place.address_components : undefined,
  };
}

async function legacyTextSearchPlaceId(query: string, key: string): Promise<string | null> {
  placesRequestCounters.legacyTextSearch += 1;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=us&key=${encodeURIComponent(key)}`;
  const data = await googleFetchJson<{ results?: GoogleTextSearchResult[] }>(url);
  return data?.results?.[0]?.place_id ?? null;
}

async function legacyPlaceDetails(
  placeId: string,
  key: string,
  needWebsite: boolean,
): Promise<PlaceRecord | null> {
  if (needWebsite) placesRequestCounters.legacyDetailsWithWebsite += 1;
  else placesRequestCounters.legacyDetails += 1;
  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "geometry",
    "types",
    "business_status",
    "address_components",
    ...(needWebsite ? ["website"] : []),
  ].join(",");
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${encodeURIComponent(key)}`;
  const data = await googleFetchJson<{ result?: GooglePlaceDetailsResult }>(url);
  return data?.result ? legacyToRecord(data.result) : null;
}

type NewPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  businessStatus?: string;
  websiteUri?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
};

function newToRecord(place: NewPlace): PlaceRecord {
  return {
    placeId: place.id,
    name: place.displayName?.text,
    formattedAddress: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    types: place.types,
    businessStatus: place.businessStatus,
    website: place.websiteUri,
    addressComponents: place.addressComponents?.map((c) => ({
      long_name: c.longText,
      short_name: c.shortText,
      types: c.types,
    })),
  };
}

/** True when the failure means this project cannot use the new API at all (not a per-place miss). */
function isNewApiUnavailableStatus(status: number, body: string): boolean {
  if (status === 403 || status === 401) return true;
  return status === 400 && /SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|not enabled/i.test(body);
}

async function newTextSearchPlaceId(query: string, key: string): Promise<string | null | "unavailable"> {
  placesRequestCounters.newTextSearch += 1;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // IDs-only mask: Text Search Essentials SKU, $0.00 with no monthly call cap.
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery: query, regionCode: "US", languageCode: "en", maxResultCount: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isNewApiUnavailableStatus(res.status, body)) {
      console.warn("[google places] Places API (New) unavailable, falling back to legacy", res.status, body.slice(0, 200));
      return "unavailable";
    }
    console.warn("[google places] searchText failed", res.status, body.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as { places?: NewPlace[] };
  return data.places?.[0]?.id ?? null;
}

async function newPlaceDetails(
  placeId: string,
  key: string,
  needWebsite: boolean,
): Promise<PlaceRecord | null | "unavailable"> {
  if (needWebsite) placesRequestCounters.newDetailsWithWebsite += 1;
  else placesRequestCounters.newDetails += 1;
  const mask = needWebsite ? `${NEW_DETAILS_FIELD_MASK_BASE},websiteUri` : NEW_DETAILS_FIELD_MASK_BASE;
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isNewApiUnavailableStatus(res.status, body)) {
      console.warn("[google places] Places API (New) details unavailable, falling back to legacy", res.status);
      return "unavailable";
    }
    console.warn("[google places] place details failed", res.status, body.slice(0, 200));
    return null;
  }
  return newToRecord((await res.json()) as NewPlace);
}

/** Resolve a free-text query to a place id, preferring the free IDs-only new-API search. */
async function textSearchPlaceId(query: string, key: string): Promise<string | null> {
  const mode = placesApiMode();
  if (mode !== "legacy" && !newPlacesApiUnavailable) {
    const id = await newTextSearchPlaceId(query, key);
    if (id !== "unavailable") return id;
    newPlacesApiUnavailable = true;
    placesRequestCounters.fallbacks += 1;
    if (mode === "new") return null;
  }
  if (mode === "new") return null;
  return legacyTextSearchPlaceId(query, key);
}

async function placeDetailsRecord(
  placeId: string,
  key: string,
  needWebsite: boolean,
): Promise<PlaceRecord | null> {
  const mode = placesApiMode();
  if (mode !== "legacy" && !newPlacesApiUnavailable) {
    const rec = await newPlaceDetails(placeId, key, needWebsite);
    if (rec !== "unavailable") return rec;
    newPlacesApiUnavailable = true;
    placesRequestCounters.fallbacks += 1;
    if (mode === "new") return null;
  }
  if (mode === "new") return null;
  return legacyPlaceDetails(placeId, key, needWebsite);
}

function evaluatePlaceMatch(
  listing: {
    name: string;
    city: string | null;
    region: string | null;
  },
  place: PlaceRecord,
): GooglePlaceVerifyResult {
  const placeName = place.name?.trim() ?? "";
  const matchScore = nameMatchScore(listing.name, placeName);
  const typeClass = classifyPlaceTypes(place.types);
  const addr = parseAddressComponents(place.addressComponents);
  const cityOk = cityMatches(listing.city, addr.city);
  const regionOk = regionMatches(listing.region, addr.region);

  if (place.businessStatus === "CLOSED_PERMANENTLY") {
    return { outcome: "outdated", reason: "Google Business Profile permanently closed", matchScore, placeId: place.placeId };
  }

  if (typeClass === "non_venue") {
    return {
      outcome: "outdated",
      reason: `Google result is not a business (${(place.types ?? []).slice(0, 4).join(", ")})`,
      matchScore,
      placeId: place.placeId,
    };
  }

  if (matchScore < 0.45) {
    return {
      outcome: "needs_review",
      reason: `Weak name match (${Math.round(matchScore * 100)}%)`,
      matchScore,
      // Do not attach placeId — promotePlaceConfirmed treats any stamped
      // googlePlaceId as "place confirmed" and would promote junk titles.
      placeId: undefined,
    };
  }

  if (!cityOk || !regionOk) {
    return {
      outcome: "needs_review",
      reason: `Location mismatch (listing ${listing.city ?? "—"}, ${listing.region ?? "—"})`,
      matchScore,
      placeId: place.placeId,
    };
  }

  const lat = place.lat;
  const lng = place.lng;
  if (!place.placeId || !place.formattedAddress || lat == null || lng == null) {
    return { outcome: "needs_review", reason: "Google place missing coordinates", matchScore, placeId: place.placeId };
  }

  return {
    outcome: matchScore >= 0.65 ? "verified" : "needs_review",
    reason:
      matchScore >= 0.65
        ? `Matched Google Business Profile (${Math.round(matchScore * 100)}% name match)`
        : `Possible match (${Math.round(matchScore * 100)}% name match) — review recommended`,
    matchScore,
    placeId: place.placeId,
    placeName,
    formattedAddress: place.formattedAddress,
    lat,
    lng,
    city: addr.city,
    region: addr.region,
    website: place.website?.trim() || undefined,
    types: place.types,
  };
}

/**
 * Look up a listing against Google Places Text Search + Details.
 */
export async function verifyListingWithGoogle(
  listing: {
    name: string;
    city: string | null;
    region: string | null;
    formattedAddress: string;
    googlePlaceId?: string | null;
  },
  opts?: {
    /**
     * Request the place's website. This is the only field in our mask that bills at the
     * Enterprise tier (1,000 free calls/month vs 5,000), so callers must opt in and only
     * when the website actually decides something — i.e. when the candidate brought its own
     * domain to cross-check against.
     */
    needWebsite?: boolean;
  },
): Promise<GooglePlaceVerifyResult> {
  const key = googleMapsServerApiKey();
  if (!key) {
    return { outcome: "skipped", reason: "No Google Maps API key configured" };
  }
  const needWebsite = opts?.needWebsite ?? false;

  const knownPlaceId = listing.googlePlaceId?.trim();
  const placeId = knownPlaceId || (await textSearchPlaceId(buildSearchQuery(listing), key));
  if (!placeId) {
    return { outcome: "needs_review", reason: "No Google Business listing found" };
  }

  const place = await placeDetailsRecord(placeId, key, needWebsite);
  if (!place) {
    return { outcome: "needs_review", reason: "No Google Business listing found" };
  }

  return evaluatePlaceMatch(listing, place);
}

export function listingGoogleVerifyPerDiscoveryRun(): number {
  return Math.min(50, Math.max(0, parseIntEnv("LISTING_GOOGLE_VERIFY_PER_RUN", 30)));
}

function appendInternalNote(existing: string | null | undefined, reason: string): string {
  const line = `[${new Date().toISOString().slice(0, 10)}] Google verify: ${reason}`;
  const base = existing?.trim();
  return base ? `${base}\n${line}` : line;
}

type VerifyRowEvidence = {
  name: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  schedules: Array<{ title: string | null; description: string | null }>;
  growthLead: { sourceKind: string | null; internalNotes: string | null; discoveryHints: unknown } | null;
};

function buildEvidenceInput(row: VerifyRowEvidence): OpenMicEvidenceInput {
  return {
    listingName: row.name,
    schedules: row.schedules,
    sourceSnippet: extractDiscoverySnippet(row.growthLead?.internalNotes),
    sourceUrl: row.sourceUrl,
    websiteUrl: row.websiteUrl,
    discoveryHints: row.growthLead?.discoveryHints,
    sourceKind: row.growthLead?.sourceKind ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Batch-verify public listings against Google Business Profiles.
 */
export async function verifyPublicListingsWithGoogle(
  prisma: PrismaClient,
  opts?: { limit?: number; dryRun?: boolean },
): Promise<BatchGoogleVerifyResult> {
  const key = googleMapsServerApiKey();
  if (!key) {
    return { verified: 0, needsReview: 0, outdated: 0, skipped: 0, noApiKey: true };
  }

  const limit = opts?.limit ?? listingGoogleVerifyPerDiscoveryRun();
  if (limit <= 0) {
    return { verified: 0, needsReview: 0, outdated: 0, skipped: 0, noApiKey: false };
  }

  const now = new Date();
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { not: "OUTDATED" },
      OR: [{ googlePlaceId: null }, { googlePlaceVerifiedAt: null }],
      AND: [
        {
          OR: [{ placeVerifyNextAttemptAt: null }, { placeVerifyNextAttemptAt: { lte: now } }],
        },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      formattedAddress: true,
      city: true,
      region: true,
      country: true,
      lat: true,
      lng: true,
      websiteUrl: true,
      sourceUrl: true,
      sourceName: true,
      googlePlaceId: true,
      googlePlaceVerifiedAt: true,
      verificationStatus: true,
      internalNotes: true,
      about: true,
      placeVerifyAttemptCount: true,
      createdAt: true,
      schedules: { select: { title: true, description: true } },
      growthLead: {
        select: {
          sourceKind: true,
          discoveryHints: true,
          websiteUrl: true,
          internalNotes: true,
        },
      },
    },
    // Age-aware: oldest eligible first so new discoveries cannot starve the backlog.
    orderBy: [{ createdAt: "asc" }, { placeVerifyAttemptCount: "asc" }, { updatedAt: "asc" }],
    take: limit,
  });

  let verified = 0;
  let needsReview = 0;
  let outdated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Track attempt timing for age-aware retries (do not erase historical stamps).
    const attemptCount = (row.placeVerifyAttemptCount ?? 0) + 1;
    const backoffHours = Math.min(48, Math.max(1, attemptCount));
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        placeVerifyAttemptCount: attemptCount,
        placeVerifyLastAttemptAt: new Date(),
        placeVerifyNextAttemptAt: new Date(Date.now() + backoffHours * 3600 * 1000),
      },
    });

    const result = await verifyListingWithGoogle(row);

    if (result.outcome === "skipped") {
      skipped += 1;
      continue;
    }

    if (opts?.dryRun) {
      const evidence = result.outcome === "verified" ? evaluateOpenMicEvidence(buildEvidenceInput(row)) : null;
      const projected =
        result.outcome === "verified" && !evidence?.trusted
          ? `needs_review (${evidence?.hasEvidence ? "untrusted evidence" : "place only"})`
          : result.outcome;
      console.info("[google verify dry-run]", row.slug, projected, result.reason);
      if (result.outcome === "verified" && evidence?.trusted) verified += 1;
      else if (result.outcome === "outdated") outdated += 1;
      else needsReview += 1;
      await sleep(250);
      continue;
    }

    if (result.outcome === "outdated") {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          lastVerifiedAt: new Date(),
          internalNotes: appendInternalNote(row.internalNotes, result.reason),
        },
      });
      outdated += 1;
    } else if (result.outcome === "verified" && result.placeId) {
      const duplicate = await prisma.publicOpenMicListing.findFirst({
        where: { googlePlaceId: result.placeId, NOT: { id: row.id } },
        select: { slug: true },
      });
      if (duplicate) {
        await prisma.publicOpenMicListing.update({
          where: { id: row.id },
          data: {
            verificationStatus: "NEEDS_REVIEW",
            lastVerifiedAt: new Date(),
            internalNotes: appendInternalNote(
              row.internalNotes,
              `Duplicate Google place (already on ${duplicate.slug})`,
            ),
          },
        });
        needsReview += 1;
      } else {
        // Google confirmed the place exists. Only publish (VERIFIED) when there is
        // ALSO explicit open-mic evidence from a trusted, venue-tied source
        // (name/schedule, venue/event/admin source, or the venue's own domain).
        // Otherwise save the place fields + coordinates but hold for review.
        const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
        /**
         * Only the place id and the verification timestamp are persisted. Maps Platform terms
         * grant no retention for Google's business name, address, or website, and its
         * coordinates may not be shown on our OpenStreetMap map, so the pin is geocoded from
         * the listing's own address by `sourceListingCoordinatesWithoutGoogle`.
         */
        const placeData = {
          googlePlaceId: result.placeId,
          googlePlaceVerifiedAt: new Date(),
          lastVerifiedAt: new Date(),
        };
        if (evidence.trusted) {
          await prisma.publicOpenMicListing.update({
            where: { id: row.id },
            data: {
              ...placeData,
              verificationStatus: "VERIFIED" satisfies PublicListingVerificationStatus,
              internalNotes: appendInternalNote(
                row.internalNotes,
                `${result.reason}; ${evidence.reason} (${evidence.field}: "${evidence.snippet}")`,
              ),
            },
          });
          verified += 1;
          // One-touch claim invite once the listing is publicly VERIFIED.
          await sendListingClaimInviteIfNeeded(prisma, row.id).catch((e) => {
            console.error("[googlePlacesVerify] claim invite failed", {
              listingId: row.id,
              error: e instanceof Error ? e.message : String(e),
            });
          });
          const base = appBaseUrl().replace(/\/$/, "");
          await submitUrlsToIndexNow([`${base}/open-mics/${encodeURIComponent(row.slug)}`]).catch(() => {});
        } else {
          const evNote = evidence.hasEvidence
            ? `${OPEN_MIC_EVIDENCE_REASON.UNTRUSTED} (${evidence.field}: "${evidence.snippet}")`
            : OPEN_MIC_EVIDENCE_REASON.PLACE_ONLY;
          await prisma.publicOpenMicListing.update({
            where: { id: row.id },
            data: {
              ...placeData,
              verificationStatus: "NEEDS_REVIEW" satisfies PublicListingVerificationStatus,
              internalNotes: appendInternalNote(row.internalNotes, `${result.reason}; ${evNote}`),
            },
          });
          needsReview += 1;
        }
      }
    } else {
      const duplicate = result.placeId
        ? await prisma.publicOpenMicListing.findFirst({
            where: { googlePlaceId: result.placeId, NOT: { id: row.id } },
            select: { slug: true },
          })
        : null;
      const data: {
        verificationStatus: typeof row.verificationStatus;
        lastVerifiedAt: Date;
        internalNotes: string;
        googlePlaceId?: string;
        googlePlaceVerifiedAt?: Date;
      } = {
        verificationStatus: row.verificationStatus === "VERIFIED" ? "NEEDS_REVIEW" : row.verificationStatus,
        lastVerifiedAt: new Date(),
        internalNotes: appendInternalNote(
          row.internalNotes,
          duplicate
            ? `${result.reason}; duplicate Google place (${duplicate.slug})`
            : result.reason,
        ),
      };
      if (result.placeId && !duplicate && (result.matchScore == null || result.matchScore >= 0.65)) {
        data.googlePlaceId = result.placeId;
        data.googlePlaceVerifiedAt = new Date();
      }
      await prisma.publicOpenMicListing.update({ where: { id: row.id }, data });
      needsReview += 1;
    }

    await sleep(250);
  }

  return { verified, needsReview, outdated, skipped, noApiKey: false };
}
