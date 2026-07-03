import type { PrismaClient, PublicListingVerificationStatus } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import {
  evaluateOpenMicEvidence,
  extractDiscoverySnippet,
  OPEN_MIC_EVIDENCE_REASON,
  type OpenMicEvidenceInput,
} from "@/lib/publicListings/openMicEvidence";

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

export function googleMapsServerApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
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

async function textSearchPlace(query: string, key: string): Promise<GoogleTextSearchResult | null> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=us&key=${encodeURIComponent(key)}`;
  const data = await googleFetchJson<{ results?: GoogleTextSearchResult[] }>(url);
  return data?.results?.[0] ?? null;
}

async function placeDetails(placeId: string, key: string): Promise<GooglePlaceDetailsResult | null> {
  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "geometry",
    "types",
    "business_status",
    "website",
    "url",
    "address_components",
  ].join(",");
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${encodeURIComponent(key)}`;
  const data = await googleFetchJson<{ result?: GooglePlaceDetailsResult }>(url);
  return data?.result ?? null;
}

function evaluatePlaceMatch(
  listing: {
    name: string;
    city: string | null;
    region: string | null;
  },
  place: GoogleTextSearchResult | GooglePlaceDetailsResult,
): GooglePlaceVerifyResult {
  const placeName = place.name?.trim() ?? "";
  const matchScore = nameMatchScore(listing.name, placeName);
  const typeClass = classifyPlaceTypes(place.types);
  const addr = parseAddressComponents(
    "address_components" in place ? place.address_components : undefined,
  );
  const cityOk = cityMatches(listing.city, addr.city);
  const regionOk = regionMatches(listing.region, addr.region);

  if (place.business_status === "CLOSED_PERMANENTLY") {
    return { outcome: "outdated", reason: "Google Business Profile permanently closed", matchScore, placeId: place.place_id };
  }

  if (typeClass === "non_venue") {
    return {
      outcome: "outdated",
      reason: `Google result is not a business (${(place.types ?? []).slice(0, 4).join(", ")})`,
      matchScore,
      placeId: place.place_id,
    };
  }

  if (matchScore < 0.45) {
    return {
      outcome: "needs_review",
      reason: `Weak name match (${Math.round(matchScore * 100)}%): Google has "${placeName}"`,
      matchScore,
      placeId: place.place_id,
    };
  }

  if (!cityOk || !regionOk) {
    return {
      outcome: "needs_review",
      reason: `Location mismatch (listing ${listing.city ?? "—"}, ${listing.region ?? "—"} vs Google ${addr.city ?? "—"}, ${addr.region ?? "—"})`,
      matchScore,
      placeId: place.place_id,
    };
  }

  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (!place.place_id || !place.formatted_address || lat == null || lng == null) {
    return { outcome: "needs_review", reason: "Google place missing coordinates", matchScore, placeId: place.place_id };
  }

  const website = "website" in place ? place.website?.trim() : undefined;

  return {
    outcome: matchScore >= 0.65 ? "verified" : "needs_review",
    reason:
      matchScore >= 0.65
        ? `Matched Google Business "${placeName}" (${Math.round(matchScore * 100)}%)`
        : `Possible match "${placeName}" (${Math.round(matchScore * 100)}%) — review recommended`,
    matchScore,
    placeId: place.place_id,
    placeName,
    formattedAddress: place.formatted_address,
    lat,
    lng,
    city: addr.city,
    region: addr.region,
    website,
  };
}

/**
 * Look up a listing against Google Places Text Search + Details.
 */
export async function verifyListingWithGoogle(listing: {
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  googlePlaceId?: string | null;
}): Promise<GooglePlaceVerifyResult> {
  const key = googleMapsServerApiKey();
  if (!key) {
    return { outcome: "skipped", reason: "No Google Maps API key configured" };
  }

  let place: GoogleTextSearchResult | GooglePlaceDetailsResult | null = null;

  if (listing.googlePlaceId?.trim()) {
    place = await placeDetails(listing.googlePlaceId.trim(), key);
  } else {
    const query = buildSearchQuery(listing);
    place = await textSearchPlace(query, key);
    if (place?.place_id) {
      const detailed = await placeDetails(place.place_id, key);
      if (detailed) place = detailed;
    }
  }

  if (!place) {
    return { outcome: "needs_review", reason: "No Google Business listing found" };
  }

  return evaluatePlaceMatch(listing, place);
}

export function listingGoogleVerifyPerDiscoveryRun(): number {
  return Math.min(30, Math.max(0, parseIntEnv("LISTING_GOOGLE_VERIFY_PER_RUN", 8)));
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

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { not: "OUTDATED" },
      OR: [{ googlePlaceId: null }, { googlePlaceVerifiedAt: null }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      googlePlaceId: true,
      websiteUrl: true,
      verificationStatus: true,
      internalNotes: true,
      sourceUrl: true,
      schedules: { select: { title: true, description: true } },
      growthLead: { select: { sourceKind: true, internalNotes: true, discoveryHints: true } },
    },
    orderBy: [{ googlePlaceVerifiedAt: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  let verified = 0;
  let needsReview = 0;
  let outdated = 0;
  let skipped = 0;

  for (const row of rows) {
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
        const placeData = {
          googlePlaceId: result.placeId,
          googlePlaceVerifiedAt: new Date(),
          lastVerifiedAt: new Date(),
          formattedAddress: result.formattedAddress ?? undefined,
          lat: result.lat,
          lng: result.lng,
          city: result.city ?? row.city,
          region: result.region ?? row.region,
          websiteUrl: row.websiteUrl?.trim() ? row.websiteUrl : result.website ?? row.websiteUrl,
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
      if (result.placeId && !duplicate) {
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
