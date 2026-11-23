import type { PrismaClient, Weekday } from "@/generated/prisma/client";
import { listingDisplayCityRegion } from "@/lib/publicListings/evidenceTrust";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import { scheduleTimesArePubliclyConfirmed } from "@/lib/publicListings/scheduleTimeSanity";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { weekdayToLabel } from "@/lib/time";

export type HomepageVerifiedListing = {
  slug: string;
  name: string;
  city: string;
  scheduleLabel: string | null;
  formatLabel: string | null;
};

const WEEKDAY_ORDER: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_PER_METRO = 3;
const HOMEPAGE_LIMIT = 12;

type GeoBucket = "midwest" | "northeast" | "south" | "west" | "international" | "other";

/** Collapse city/region into a metro bucket so one city cannot dominate the SSR strip. */
export function homepageMetroKey(city: string | null | undefined, region: string | null | undefined): string {
  const c = (city ?? "").trim().toLowerCase();
  const r = (region ?? "").trim().toLowerCase();
  const place = `${c} ${r}`;

  if (/\b(toronto|vancouver|montreal|calgary|ottawa|ontario|british columbia|quebec)\b/.test(place) || r === "on" || r === "bc" || r === "qc") {
    if (/\btoronto\b/.test(place)) return "toronto-ca";
    if (/\bvancouver\b/.test(place)) return "vancouver-ca";
    if (/\bmontreal\b/.test(place)) return "montreal-ca";
    return `ca-${r || c || "other"}`;
  }
  if (/\b(london|manchester|edinburgh|glasgow|england|scotland|wales|uk|united kingdom)\b/.test(place) || r === "eng" || r === "gb") {
    if (/\blondon\b/.test(place)) return "london-uk";
    return `uk-${c || "other"}`;
  }
  if (/\b(sydney|melbourne|brisbane|australia|nsw|vic)\b/.test(place) || r === "nsw" || r === "vic" || r === "qld") {
    if (/\bsydney\b/.test(place)) return "sydney-au";
    if (/\bmelbourne\b/.test(place)) return "melbourne-au";
    return `au-${c || "other"}`;
  }
  if (/\b(auckland|wellington|new zealand|nz)\b/.test(place) || r === "nz") {
    return `nz-${c || "other"}`;
  }

  // US metros
  if (/\b(chicago|evanston|oak park|naperville)\b/.test(place) || (/\bil\b|illinois/.test(place) && /\bchicago\b/.test(place))) {
    return "chicago-il";
  }
  if (/\b(new york|brooklyn|manhattan|queens|bronx|nyc)\b/.test(place)) return "new-york-ny";
  if (/\b(los angeles|hollywood|santa monica|pasadena|hollywood hills)\b/.test(place)) return "los-angeles-ca";
  if (/\baustin\b/.test(place)) return "austin-tx";
  if (/\bnashville\b/.test(place)) return "nashville-tn";
  if (/\batlanta\b/.test(place)) return "atlanta-ga";
  if (/\bseattle\b/.test(place)) return "seattle-wa";
  if (/\bportland\b/.test(place) && /\bor\b|oregon/.test(place)) return "portland-or";
  if (/\bboston\b/.test(place)) return "boston-ma";
  if (/\bphiladelphia\b/.test(place) || /\bphilly\b/.test(place)) return "philadelphia-pa";
  if (/\bdenver\b/.test(place)) return "denver-co";
  if (/\bhouston\b/.test(place)) return "houston-tx";
  if (/\bdallas\b/.test(place)) return "dallas-tx";
  if (/\bmiami\b/.test(place)) return "miami-fl";
  if (/\bminneapolis\b/.test(place) || /\bst\.?\s*paul\b/.test(place)) return "minneapolis-mn";
  if (/\bdetroit\b/.test(place)) return "detroit-mi";
  if (/\bsan francisco\b|\bsf\b/.test(place)) return "san-francisco-ca";
  if (/\bsan diego\b/.test(place)) return "san-diego-ca";

  const regionKey = r.replace(/[^a-z0-9]+/g, "-") || "unknown";
  const cityKey = c.replace(/[^a-z0-9]+/g, "-") || "unknown";
  return `${cityKey}-${regionKey}`;
}

export function homepageGeoBucket(city: string | null | undefined, region: string | null | undefined): GeoBucket {
  const r = (region ?? "").trim().toUpperCase();
  const place = `${city ?? ""} ${region ?? ""}`.toLowerCase();

  if (
    /\b(toronto|vancouver|montreal|london|sydney|melbourne|auckland|wellington|canada|ontario|uk|england|australia|new zealand)\b/.test(
      place,
    ) ||
    ["ON", "BC", "QC", "AB", "NSW", "VIC", "QLD", "NZ", "ENG", "GB", "UK"].includes(r)
  ) {
    return "international";
  }

  const midwest = new Set(["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"]);
  const northeast = new Set(["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT", "DC"]);
  const south = new Set(["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"]);
  const west = new Set(["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"]);

  if (midwest.has(r)) return "midwest";
  if (northeast.has(r)) return "northeast";
  if (south.has(r)) return "south";
  if (west.has(r)) return "west";
  return "other";
}

function bucketPriority(bucket: GeoBucket): number {
  switch (bucket) {
    case "midwest":
      return 50;
    case "northeast":
      return 48;
    case "south":
      return 46;
    case "west":
      return 44;
    case "international":
      return 30;
    default:
      return 10;
  }
}

/**
 * Pick up to `limit` verified listings for SSR homepage/finder fallback.
 * Max 3 per metro; prefer US regional mix then strong international rooms.
 * Not personalized by visitor location.
 */
export function selectHomepageVerifiedMix<
  T extends {
    metroKey: string;
    geoBucket: GeoBucket;
    hasConfirmedSchedule: boolean;
    hasAnySchedule: boolean;
    name: string;
  },
>(rows: T[], limit = HOMEPAGE_LIMIT): T[] {
  const take = Math.min(HOMEPAGE_LIMIT, Math.max(1, limit));
  const score = (r: T) =>
    bucketPriority(r.geoBucket) + (r.hasConfirmedSchedule ? 80 : r.hasAnySchedule ? 20 : 0);

  const byBucket = new Map<GeoBucket, T[]>();
  for (const row of rows) {
    const list = byBucket.get(row.geoBucket) ?? [];
    list.push(row);
    byBucket.set(row.geoBucket, list);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  }

  const order: GeoBucket[] = ["midwest", "northeast", "south", "west", "international", "other"];
  const metroCounts = new Map<string, number>();
  const picked: T[] = [];
  const pickedKeys = new Set<string>();
  const rowKey = (r: T) => `${r.metroKey}::${r.name}`;

  // Round-robin across regions so one metro/region cannot dominate the SSR strip.
  let progressed = true;
  while (picked.length < take && progressed) {
    progressed = false;
    for (const bucket of order) {
      if (picked.length >= take) break;
      const list = byBucket.get(bucket);
      if (!list?.length) continue;
      while (list.length > 0) {
        const row = list.shift()!;
        if (pickedKeys.has(rowKey(row))) continue;
        const metroN = metroCounts.get(row.metroKey) ?? 0;
        if (metroN >= MAX_PER_METRO) continue;
        picked.push(row);
        pickedKeys.add(rowKey(row));
        metroCounts.set(row.metroKey, metroN + 1);
        progressed = true;
        break;
      }
    }
  }

  return picked;
}

export async function loadHomepageVerifiedOpenMics(
  prisma: PrismaClient,
  limit = HOMEPAGE_LIMIT,
): Promise<HomepageVerifiedListing[]> {
  const take = Math.min(HOMEPAGE_LIMIT, Math.max(8, limit));
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      removedAt: null,
      claimedVenueId: null,
      city: { not: null },
    },
    select: {
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      lastVerifiedAt: true,
      schedules: {
        where: { isActive: true },
        select: {
          weekday: true,
          startTimeMin: true,
          description: true,
          performanceFormat: true,
        },
      },
    },
    orderBy: { lastVerifiedAt: "desc" },
    take: 240,
  });

  const candidates = rows
    .filter((r) => isPublicListingNameOk(r.name) && Boolean(r.city?.trim()))
    .map((r) => {
      const place = listingDisplayCityRegion({
        name: r.name,
        city: r.city,
        region: r.region,
        formattedAddress: r.formattedAddress,
      });
      const confirmed = r.schedules.filter((s) => scheduleTimesArePubliclyConfirmed(s));
      const days = [...new Set(confirmed.map((s) => s.weekday))].sort(
        (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
      );
      const scheduleLabel =
        days.length === 0
          ? null
          : days.length === 1
            ? `${weekdayToLabel(days[0]!)}s`
            : days.map((d) => weekdayToLabel(d).slice(0, 3)).join(" · ");
      const format = confirmed.map((s) => s.performanceFormat).find(Boolean);
      const city = (place.city || r.city || "").trim();
      const region = place.region || r.region;
      return {
        slug: r.slug,
        name: r.name,
        city,
        scheduleLabel,
        formatLabel: format ? performanceFormatLabel(format) : null,
        hasConfirmedSchedule: confirmed.length > 0,
        hasAnySchedule: r.schedules.length > 0,
        metroKey: homepageMetroKey(city, region),
        geoBucket: homepageGeoBucket(city, region),
      };
    })
    // Homepage strip: real place names + confirmed schedules only (no "schedule being confirmed").
    .filter((r) => Boolean(r.city) && r.hasConfirmedSchedule && Boolean(r.scheduleLabel));

  return selectHomepageVerifiedMix(candidates, take).map(({ slug, name, city, scheduleLabel, formatLabel }) => ({
    slug,
    name,
    city,
    scheduleLabel,
    formatLabel,
  }));
}
