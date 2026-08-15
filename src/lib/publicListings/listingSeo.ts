/**
 * Public listing SEO helpers (titles, descriptions, index gate alignment).
 * Does not loosen public-quality or open-mic evidence gates.
 */
import type { Weekday } from "@/generated/prisma/client";
import { evaluateOpenMicEvidence } from "@/lib/publicListings/openMicEvidence";
import {
  isPublicListingRenderable,
  listingIsPubliclyIndexable,
} from "@/lib/publicListings/listingQuality";
import { weekdayToLabel } from "@/lib/time";

const OPEN_MIC_IN_NAME = /\bopen[\s-]?mics?\b|\bopen[\s-]?mikes?\b/i;

export function listingPlaceLabel(city: string | null | undefined, region: string | null | undefined): string {
  return [city, region].filter(Boolean).join(", ");
}

/** SEO title without the trailing "| MicStage" (layout template / absolute title adds brand). */
export function publicListingSeoTitle(input: {
  name: string;
  city: string | null;
  region: string | null;
}): string {
  const name = (input.name ?? "").trim() || "Open mic";
  const place = listingPlaceLabel(input.city, input.region);
  const nameHasOpenMic = OPEN_MIC_IN_NAME.test(name);
  if (place) {
    return nameHasOpenMic ? `${name} | ${place}` : `${name} | Open Mic in ${place}`;
  }
  return nameHasOpenMic ? name : `${name} | Open Mic`;
}

export function publicListingSeoDescription(input: {
  name: string;
  city: string | null;
  region: string | null;
  schedules: Array<{ weekday: Weekday; title?: string | null }>;
  signupMethod?: string | null;
}): string {
  const name = (input.name ?? "").trim() || "This open mic";
  const place = listingPlaceLabel(input.city, input.region);
  const trustedSchedules = input.schedules ?? [];
  if (trustedSchedules.length > 0 && place) {
    const days = [...new Set(trustedSchedules.map((s) => weekdayToLabel(s.weekday)))].slice(0, 3);
    const dayBit = days.length === 1 ? days[0] : days.slice(0, -1).join(", ") + ` and ${days[days.length - 1]}`;
    const signup =
      input.signupMethod?.trim() ||
      trustedSchedules.map((s) => s.title).find((t) => t?.trim()) ||
      null;
    const signupBit = signup ? ` Signup: ${signup.trim()}.` : "";
    return `${name} happens weekly on ${dayBit} in ${place}.${signupBit} See location and the latest schedule on MicStage.`;
  }
  return `Find schedule, venue and signup details for ${name}${place ? ` in ${place}` : ""}. See current open-mic information on MicStage.`;
}

/**
 * Full SEO index gate: renderable + substance + removedAt + open-mic evidence.
 * Aligns sitemap and listing metadata with browse discovery quality.
 */
export function listingMeetsPublicSeoIndexGate(listing: {
  name: string;
  verificationStatus: string;
  formattedAddress: string;
  city: string | null;
  schedules: Array<{
    title?: string | null;
    description?: string | null;
    performanceFormat?: string | null;
  }>;
  lastVerifiedAt: Date | null;
  removedAt?: Date | null;
  sourceUrl?: string | null;
  websiteUrl?: string | null;
}): boolean {
  if (!isPublicListingRenderable(listing)) return false;
  if (!listingIsPubliclyIndexable(listing)) return false;
  return evaluateOpenMicEvidence({
    listingName: listing.name,
    schedules: listing.schedules.map((s) => ({
      title: s.title ?? null,
      description: s.description ?? null,
    })),
    sourceUrl: listing.sourceUrl,
    websiteUrl: listing.websiteUrl,
  }).trusted;
}

/** Map JS getDay() (0=Sun) to Prisma Weekday. */
export function jsDayToWeekday(jsDay: number): Weekday {
  const map: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[((jsDay % 7) + 7) % 7]!;
}

export function formatCategoryBucket(
  formats: Array<string | null | undefined>,
): "comedy" | "spoken" | "music" | null {
  const set = new Set(formats.filter(Boolean).map((f) => String(f)));
  if (set.has("COMEDY") || set.has("COMEDY_SPOKEN_WORD")) return "comedy";
  if (set.has("SPOKEN_WORD")) return "spoken";
  if (
    set.has("ACOUSTIC_ONLY") ||
    set.has("GUITAR_VOCAL_ONLY") ||
    set.has("FULL_BANDS_ALLOWED") ||
    set.has("OPEN_VARIETY")
  ) {
    return "music";
  }
  return null;
}

/**
 * Event JSON-LD eligibility for public listing pages.
 *
 * Recurring weekday schedules alone are NOT enough — we require concrete
 * occurrence objects with a valid ISO `startDate`. MicStage public listings
 * currently store recurring schedules only, so this normally returns [].
 */
export function buildListingEventJsonLd(input: {
  listingName: string;
  formattedAddress?: string | null;
  url: string;
  /** Concrete dated occurrences only — never synthesize from weekday recurrence. */
  occurrences?: Array<{
    startDate: string;
    endDate?: string | null;
    name?: string | null;
  }> | null;
}): Record<string, unknown>[] {
  const occurrences = input.occurrences ?? [];
  const out: Record<string, unknown>[] = [];
  for (const occ of occurrences) {
    const start = (occ.startDate ?? "").trim();
    if (!isValidEventStartDate(start)) continue;
    out.push({
      "@context": "https://schema.org",
      "@type": "Event",
      name: (occ.name ?? "").trim() || input.listingName,
      startDate: start,
      ...(occ.endDate?.trim() ? { endDate: occ.endDate.trim() } : {}),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: input.listingName,
        ...(input.formattedAddress?.trim()
          ? { address: input.formattedAddress.trim() }
          : {}),
      },
      url: input.url,
    });
  }
  return out;
}

/** Accepts full ISO-8601 datetime or date-only YYYY-MM-DD. */
export function isValidEventStartDate(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime());
  }
  const d = new Date(t);
  return !Number.isNaN(d.getTime());
}

/** Minimal venue quality gate for sitemap inclusion (no redesign). */
export function venueIsSitemapEligible(v: {
  name: string;
  slug: string;
  googlePlaceId?: string | null;
  formattedAddress: string;
}): boolean {
  const name = (v.name ?? "").trim();
  const slug = (v.slug ?? "").trim();
  const addr = (v.formattedAddress ?? "").trim();
  const placeId = (v.googlePlaceId ?? "").trim();
  if (name.length < 2) return false;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  if (addr.length < 5) return false;
  if (!placeId) return false;
  return true;
}
