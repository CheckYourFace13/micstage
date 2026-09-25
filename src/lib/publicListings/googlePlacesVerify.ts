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
import {
  googleMapsServerApiKey,
  placesDetailsPro,
  placesTextSearchIdsOnly,
  type ProDetails,
} from "@/lib/places/placesGateway";

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

export { googleMapsServerApiKey };

export function usingPublicKeyForServerPlaces(): boolean {
  return false;
}

const placesRequestCounters = {
  newTextSearch: 0,
  newDetails: 0,
  newDetailsWithWebsite: 0,
  legacyTextSearch: 0,
  legacyDetails: 0,
  legacyDetailsWithWebsite: 0,
  fallbacks: 0,
  deduped: 0,
  budgetBlocked: 0,
};

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

function proToRecord(place: ProDetails) {
  return {
    placeId: place.id,
    name: place.displayName?.text,
    formattedAddress: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    types: place.types,
    businessStatus: place.businessStatus,
    addressComponents: place.addressComponents?.map((c) => ({
      long_name: c.longText,
      short_name: c.shortText,
      types: c.types,
    })),
  };
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
    prisma?: PrismaClient;
    allowPaidDetails?: boolean;
    listingId?: string;
    detailsCheckedAt?: Date | null;
  },
): Promise<GooglePlaceVerifyResult & { detailsFetched?: boolean; duplicateWithoutDetails?: boolean }> {
  if (!googleMapsServerApiKey() || !opts?.prisma) {
    return { outcome: "skipped", reason: "No Google Maps API key configured" };
  }
  const prisma = opts.prisma;
  const knownPlaceId = listing.googlePlaceId?.trim() || null;
  let placeId = knownPlaceId;
  if (!placeId) {
    const search = await placesTextSearchIdsOnly(prisma, {
      query: buildSearchQuery(listing),
      purpose: "listing_verify",
    });
    if (search.blockedReason) placesRequestCounters.budgetBlocked += 1;
    if (search.deduped) placesRequestCounters.deduped += 1;
    if (search.sent) placesRequestCounters.newTextSearch += 1;
    placeId = search.placeId;
  }
  if (!placeId) {
    return { outcome: "needs_review", reason: "No Google Business listing found" };
  }
  if (!opts.allowPaidDetails || detailsCheckedRecently(opts.detailsCheckedAt)) {
    return {
      outcome: "needs_review",
      reason: opts.detailsCheckedAt
        ? "Details already checked for this listing"
        : "Place ID stored; paid details deferred until trusted evidence",
      placeId,
    };
  }
  const listings = (prisma as { publicOpenMicListing?: { findFirst: (args: unknown) => Promise<{ id: string } | null> } })
    .publicOpenMicListing;
  if (opts.listingId && listings) {
    const other = await listings.findFirst({
      where: {
        googlePlaceId: placeId,
        googlePlaceDetailsCheckedAt: { not: null },
        NOT: { id: opts.listingId },
      },
      select: { id: true },
    });
    if (other) {
      return {
        outcome: "needs_review",
        reason: "Duplicate Google place (already checked)",
        placeId,
        duplicateWithoutDetails: true,
      };
    }
  }
  const details = await placesDetailsPro(prisma, { placeId, purpose: "listing_verify" });
  if (details.place) {
    if (details.sent) placesRequestCounters.newDetails += 1;
    return { ...evaluatePlaceMatch(listing, proToRecord(details.place)), detailsFetched: true };
  }
  if (details.blockedReason) {
    placesRequestCounters.budgetBlocked += 1;
    return { outcome: "skipped", reason: details.blockedReason, placeId };
  }
  if (details.sent) placesRequestCounters.newDetails += 1;
  return { outcome: "needs_review", reason: "No Google Business listing found", placeId };
}

export function listingGoogleVerifyPerDiscoveryRun(): number {
  return Math.min(50, Math.max(0, parseIntEnv("LISTING_GOOGLE_VERIFY_PER_RUN", 5)));
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

/** IDs-only may store the Place ID. Verified-at means Details identity validation succeeded. */
export function shouldStampPlaceVerifiedAt(result: { outcome: string }): boolean {
  return result.outcome === "verified";
}

/** Paid Details is not repeated just because verification did not stamp googlePlaceVerifiedAt. */
export const PLACE_DETAILS_RECHECK_MS = 30 * 24 * 3600 * 1000;

export function detailsCheckedRecently(checkedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!checkedAt) return false;
  return now - checkedAt.getTime() < PLACE_DETAILS_RECHECK_MS;
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

  const inventoryTarget = Math.max(0, parseIntEnv("PLACES_ENRICH_MIN_VERIFIED_INVENTORY", 150));
  const verifiedInventory = await prisma.publicOpenMicListing.count({
    where: { verificationStatus: "VERIFIED", removedAt: null, googlePlaceId: { not: null } },
  });
  if (verifiedInventory >= inventoryTarget) {
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
      googlePlaceDetailsCheckedAt: true,
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
    const attemptCount = (row.placeVerifyAttemptCount ?? 0) + 1;
    const evidence = evaluateOpenMicEvidence(buildEvidenceInput(row));
    const result = await verifyListingWithGoogle(row, {
      prisma,
      listingId: row.id,
      detailsCheckedAt: row.googlePlaceDetailsCheckedAt,
      allowPaidDetails:
        evidence.trusted && !row.googlePlaceVerifiedAt && !detailsCheckedRecently(row.googlePlaceDetailsCheckedAt),
    });
    const paidFinished = Boolean(result.detailsFetched || result.duplicateWithoutDetails);
    const noMatch = result.reason.includes("No Google Business listing");
    const weak = result.reason.startsWith("Weak name match");
    const cooldownHours = paidFinished || noMatch || weak ? 24 * 30 : Math.min(48, Math.max(1, attemptCount));
    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        placeVerifyAttemptCount: attemptCount,
        placeVerifyLastAttemptAt: new Date(),
        placeVerifyNextAttemptAt: new Date(Date.now() + cooldownHours * 3600 * 1000),
        ...(paidFinished ? { googlePlaceDetailsCheckedAt: new Date() } : {}),
      },
    });

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
      if (result.placeId && !duplicate) {
        data.googlePlaceId = result.placeId;
      }
      if (shouldStampPlaceVerifiedAt(result)) {
        data.googlePlaceVerifiedAt = new Date();
      }
      await prisma.publicOpenMicListing.update({ where: { id: row.id }, data });
      needsReview += 1;
    }

    await sleep(250);
  }

  return { verified, needsReview, outdated, skipped, noApiKey: false };
}
