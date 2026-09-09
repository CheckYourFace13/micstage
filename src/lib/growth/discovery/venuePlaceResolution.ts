import type { PrismaClient } from "@/generated/prisma/client";
import type { ExtractedVenueCandidate } from "@/lib/growth/discovery/venueCandidateExtraction";
import { googleMapsServerApiKey, verifyListingWithGoogle } from "@/lib/publicListings/googlePlacesVerify";

/**
 * Resolves an extracted venue candidate against Google Places so the venue lane only creates leads
 * with a real, locatable business identity. Results (including negatives) are cached by candidate
 * key so repeated discovery runs never re-spend a lookup.
 */

export type PlaceResolutionStatus =
  | "resolved"
  | "unresolved"
  | "rejected"
  | "cached_resolved"
  | "cached_unresolved"
  | "skipped_no_key"
  | "budget_exhausted";

export type PlaceResolution = {
  status: PlaceResolutionStatus;
  reason: string;
  placeId: string | null;
  canonicalName: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  websiteHost: string | null;
  matchScore: number | null;
  /** True when a paid Places lookup was actually spent. */
  spentLookup: boolean;
};

/** Google match strength required before a discovery candidate counts as a real venue. */
const MIN_PLACE_MATCH_SCORE = 0.65;

/** Negative results are retried after this long, so a temporary miss is not permanent. */
const UNRESOLVED_TTL_MS = 21 * 24 * 60 * 60 * 1000;

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

const US_STATE_ABBR_RE =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}/i;

/** MicStage is a US product; a same-named business abroad is a coincidence, not the venue. */
export function isUnitedStatesAddress(address: string | null | undefined): boolean {
  const a = address?.trim();
  if (!a) return false;
  if (/\bUSA\b|\bUnited States\b/i.test(a)) return true;
  return US_STATE_ABBR_RE.test(a);
}

/** Same registrable-ish domain, tolerating subdomains on either side. */
export function domainsAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;
  const core = (h: string) => h.split(".").slice(-2).join(".");
  return core(a) === core(b);
}

export function placeLookupKey(input: {
  name: string;
  city?: string | null;
  region?: string | null;
}): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return [norm(input.name), norm(input.city), norm(input.region)].join("|");
}

export function discoveryPlaceLookupsPerRun(): number {
  const raw = Number.parseInt(process.env.DISCOVERY_PLACE_LOOKUPS_PER_RUN ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(200, raw);
  return 25;
}

/**
 * Daily ceiling across all runs. Discovery ticks every 30 minutes, so a per-run cap alone would
 * allow thousands of billed lookups per day; this keeps spend inside Google's monthly credit.
 */
export function discoveryPlaceLookupsPerDay(): number {
  const raw = Number.parseInt(process.env.DISCOVERY_PLACE_LOOKUPS_PER_DAY ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(5000, raw);
  return 120;
}

/** Builds a run budget that also respects how many lookups today has already spent. */
export async function createPlaceLookupBudget(prisma: PrismaClient): Promise<PlaceLookupBudget> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let spentToday = 0;
  try {
    spentToday = await prisma.growthPlaceLookup.count({ where: { updatedAt: { gte: startOfDay } } });
  } catch {
    // Table missing (pre-migration): fall back to the per-run cap only.
  }
  const dailyRemaining = Math.max(0, discoveryPlaceLookupsPerDay() - spentToday);
  return new PlaceLookupBudget(Math.min(discoveryPlaceLookupsPerRun(), dailyRemaining));
}

/** Per-run budget so a single discovery pass cannot exhaust the Places quota. */
export class PlaceLookupBudget {
  private spent = 0;
  private cacheHits = 0;
  private readonly max: number;

  constructor(max?: number) {
    this.max = max ?? discoveryPlaceLookupsPerRun();
  }

  get remaining(): number {
    return Math.max(0, this.max - this.spent);
  }

  get spentCount(): number {
    return this.spent;
  }

  get cacheHitCount(): number {
    return this.cacheHits;
  }

  noteSpend(): void {
    this.spent += 1;
  }

  noteCacheHit(): void {
    this.cacheHits += 1;
  }
}

function fromCacheRow(row: {
  outcome: string;
  reason: string | null;
  matchScore: number | null;
  placeId: string | null;
  canonicalName: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  websiteHost: string | null;
}): PlaceResolution {
  return {
    status: row.outcome === "resolved" ? "cached_resolved" : "cached_unresolved",
    reason: row.reason ?? `cached_${row.outcome}`,
    placeId: row.placeId,
    canonicalName: row.canonicalName,
    formattedAddress: row.formattedAddress,
    lat: row.lat,
    lng: row.lng,
    website: row.website,
    websiteHost: row.websiteHost,
    matchScore: row.matchScore,
    spentLookup: false,
  };
}

function unresolved(status: PlaceResolutionStatus, reason: string, spentLookup = false): PlaceResolution {
  return {
    status,
    reason,
    placeId: null,
    canonicalName: null,
    formattedAddress: null,
    lat: null,
    lng: null,
    website: null,
    websiteHost: null,
    matchScore: null,
    spentLookup,
  };
}

export async function resolveVenueCandidateWithPlaces(
  prisma: PrismaClient,
  candidate: Pick<ExtractedVenueCandidate, "name" | "city" | "region" | "streetAddress" | "websiteUrl">,
  budget: PlaceLookupBudget,
): Promise<PlaceResolution> {
  const name = candidate.name?.trim();
  if (!name) return unresolved("unresolved", "missing_name");

  const key = placeLookupKey({ name, city: candidate.city, region: candidate.region });

  const cached = await prisma.growthPlaceLookup.findUnique({ where: { lookupKey: key } });
  if (cached) {
    const fresh = cached.outcome === "resolved" || Date.now() - cached.updatedAt.getTime() < UNRESOLVED_TTL_MS;
    if (fresh) {
      budget.noteCacheHit();
      await prisma.growthPlaceLookup.update({
        where: { lookupKey: key },
        data: { hitCount: { increment: 1 } },
      });
      return fromCacheRow(cached);
    }
  }

  if (!googleMapsServerApiKey()) return unresolved("skipped_no_key", "no_google_maps_api_key");
  if (budget.remaining <= 0) return unresolved("budget_exhausted", "place_lookup_budget_exhausted");

  budget.noteSpend();
  const verify = await verifyListingWithGoogle({
    name,
    city: candidate.city ?? null,
    region: candidate.region ?? null,
    formattedAddress: candidate.streetAddress ?? "",
  });

  /**
   * A name can match a same-named business anywhere on earth. Two corroborations keep a
   * coincidence from becoming a lead: the place must be in the US, and when the candidate
   * brought its own website that domain must agree with the one Google has on file.
   */
  const inUnitedStates = isUnitedStatesAddress(verify.formattedAddress);
  const candidateHost = hostOf(candidate.websiteUrl ?? null);
  const placeWebsiteHost = hostOf(verify.website ?? null);
  const domainConflict =
    Boolean(candidateHost) && Boolean(placeWebsiteHost) && !domainsAgree(candidateHost, placeWebsiteHost);

  const strongEnough =
    verify.outcome === "verified" &&
    Boolean(verify.placeId) &&
    verify.lat != null &&
    verify.lng != null &&
    (verify.matchScore ?? 0) >= MIN_PLACE_MATCH_SCORE &&
    inUnitedStates &&
    !domainConflict;

  const rejectReason = !inUnitedStates
    ? `place_outside_us (${verify.formattedAddress ?? "unknown address"})`
    : domainConflict
      ? `website_domain_conflict (candidate ${candidateHost} vs google ${placeWebsiteHost})`
      : null;

  const resolution: PlaceResolution = strongEnough
    ? {
        status: "resolved",
        reason: verify.reason ?? "matched",
        placeId: verify.placeId ?? null,
        canonicalName: verify.placeName ?? name,
        formattedAddress: verify.formattedAddress ?? null,
        lat: verify.lat ?? null,
        lng: verify.lng ?? null,
        website: verify.website ?? null,
        websiteHost: hostOf(verify.website ?? null),
        matchScore: verify.matchScore ?? null,
        spentLookup: true,
      }
    : {
        ...unresolved(
          rejectReason || verify.outcome === "outdated" ? "rejected" : "unresolved",
          rejectReason ?? verify.reason ?? "no_match",
          true,
        ),
        matchScore: verify.matchScore ?? null,
        placeId: verify.placeId ?? null,
      };

  const cacheData = {
    outcome: resolution.status === "resolved" ? "resolved" : resolution.status === "rejected" ? "rejected" : "unresolved",
    reason: resolution.reason.slice(0, 300),
    matchScore: resolution.matchScore,
    placeId: resolution.status === "resolved" ? resolution.placeId : null,
    canonicalName: resolution.canonicalName,
    formattedAddress: resolution.formattedAddress,
    lat: resolution.lat,
    lng: resolution.lng,
    website: resolution.website,
    websiteHost: resolution.websiteHost,
  };
  await prisma.growthPlaceLookup.upsert({
    where: { lookupKey: key },
    create: { lookupKey: key, ...cacheData },
    update: cacheData,
  });

  return resolution;
}

export function placeResolutionIsUsable(r: PlaceResolution): boolean {
  return (r.status === "resolved" || r.status === "cached_resolved") && Boolean(r.placeId) && r.lat != null && r.lng != null;
}
