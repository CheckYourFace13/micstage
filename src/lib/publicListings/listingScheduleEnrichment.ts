/**
 * Confirm weekday/time on VERIFIED unscheduled listings from official sources only.
 * Never invents a schedule, end time, or timezone.
 */
import tzLookup from "tz-lookup";
import type { PrismaClient, Weekday } from "@/generated/prisma/client";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { evaluateFetchedEvidenceTrust, isNonVenueEvidenceHost } from "@/lib/publicListings/evidenceTrust";
import { isPublicListingNameOk } from "@/lib/publicListings/listingQuality";
import {
  extractOfficialIcsUrls,
  parseExplicitScheduleFromHtml,
  parseExplicitScheduleFromIcs,
  parseExplicitScheduleFromText,
} from "@/lib/publicListings/explicitScheduleParse";
import { expandOfficialEvidenceUrls } from "@/lib/publicListings/evidenceEnrichment";
import { submitUrlsToIndexNow } from "@/lib/seo/searchEnginePing";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { resolveScheduleEndMin } from "@/lib/scheduleWindow";
import { SCHEDULE_ENRICH_LOCK, withPgAdvisoryLock } from "@/lib/growth/enrichmentLock";

const PAGE_TIMEOUT_MS = 8_000;

export type ScheduleEnrichResult = {
  scanned: number;
  confirmed: number;
  uncertain: number;
  skipped: number;
};

function hostFromUrl(u: string | null | undefined): string | null {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim().includes("://") ? u.trim() : `https://${u.trim()}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function officialEnough(listingHost: string | null, pageUrl: string): boolean {
  const pageHost = hostFromUrl(pageUrl);
  if (!pageHost || isNonVenueEvidenceHost(pageHost)) return false;
  if (!listingHost) return false;
  return pageHost === listingHost || pageHost.endsWith(`.${listingHost}`) || listingHost.endsWith(`.${pageHost}`);
}

/**
 * Timezone from stored geography (tz-lookup on lat/lng).
 * Listing.timeZone defaults to America/Chicago for every row — that is not geography.
 * A non-default stored IANA zone is treated as previously resolved.
 * Returns null when the zone cannot be determined; caller must not activate.
 */
export function resolveTrustedListingTimeZone(listing: {
  timeZone?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  if (listing.lat != null && listing.lng != null && Number.isFinite(listing.lat) && Number.isFinite(listing.lng)) {
    try {
      const zone = tzLookup(listing.lat, listing.lng);
      if (typeof zone === "string" && zone.includes("/")) return zone;
    } catch {
      /* do not guess */
    }
  }
  const stored = listing.timeZone?.trim() ?? "";
  if (stored.includes("/") && stored !== "America/Chicago") return stored;
  return null;
}

/** Stated end only. Midnight wrap when the source gave a real end at/before start. */
export function explicitScheduleEndTimeMin(parsed: {
  startTimeMin: number;
  endTimeMin: number | null;
}): number | null {
  if (parsed.endTimeMin == null) return null;
  return resolveScheduleEndMin(parsed.startTimeMin, parsed.endTimeMin);
}

const PRIORITY_MARKET =
  /\b(chicago|new york|brooklyn|manhattan|los angeles|austin|nashville|denver|portland|seattle|atlanta|boston|philadelphia|houston|dallas|miami|minneapolis|detroit)\b/i;

export function scheduleMarketPriorityScore(listing: {
  city?: string | null;
  region?: string | null;
}): number {
  const place = `${listing.city ?? ""} ${listing.region ?? ""}`.toLowerCase();
  if (/\bchicago\b/.test(place) || /\bil\b/.test(place) || /\billinois\b/.test(place)) return 100;
  if (PRIORITY_MARKET.test(place)) return 70;
  return 10;
}

function looksLikeEventUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /eventbrite|facebook\.com\/events|\/events?\/|calendar|open-?mic/i.test(url);
}

/**
 * Schedule-mining order: listings already getting impressions, biggest cities,
 * official website, known social/event URL, HIGH contact, remaining verified.
 */
export function scheduleMiningPriorityScore(listing: {
  city?: string | null;
  region?: string | null;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  highContact?: boolean;
  searchImpressions?: number | null;
}): number {
  let score = scheduleMarketPriorityScore(listing);
  const impressions = listing.searchImpressions ?? 0;
  if (impressions > 0) score += 1000 + Math.min(500, impressions);
  if (listing.websiteUrl?.trim()) score += 40;
  if (listing.facebookUrl || listing.instagramUrl || looksLikeEventUrl(listing.sourceUrl)) score += 25;
  if (listing.highContact) score += 15;
  return score;
}

function officialSocialUrl(listing: { facebookUrl?: string | null; instagramUrl?: string | null }, pageUrl: string): boolean {
  const page = hostFromUrl(pageUrl);
  if (!page) return false;
  const official = [listing.facebookUrl, listing.instagramUrl]
    .map((u) => hostFromUrl(u))
    .filter((h): h is string => Boolean(h));
  if (official.length === 0) return false;
  return official.some((h) => page === h || page.endsWith(`.${h}`) || h.endsWith(`.${page}`));
}

function crawlableOfficial(
  listingHost: string | null,
  pageUrl: string,
  listing: { facebookUrl?: string | null; instagramUrl?: string | null },
): boolean {
  if (officialEnough(listingHost, pageUrl)) return true;
  return officialSocialUrl(listing, pageUrl);
}

async function enrichVerifiedListingSchedulesUnlocked(
  prisma: PrismaClient,
  limit: number,
): Promise<ScheduleEnrichResult> {

  let rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      removedAt: null,
      claimedVenueId: null,
      schedules: { none: { isActive: true } },
      OR: [{ websiteUrl: { not: null } }, { sourceUrl: { not: null } }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      websiteUrl: true,
      sourceUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      timeZone: true,
      lat: true,
      lng: true,
      signupMethod: true,
      lastVerifiedAt: true,
      growthLead: {
        select: {
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          contactEmailConfidence: true,
        },
      },
    },
    orderBy: { lastVerifiedAt: "desc" },
    take: Math.min(160, Math.max(limit * 10, limit)),
  });
  rows.sort(
    (a, b) =>
      scheduleMiningPriorityScore({
        ...b,
        highContact: b.growthLead?.contactEmailConfidence === "HIGH",
      }) -
      scheduleMiningPriorityScore({
        ...a,
        highContact: a.growthLead?.contactEmailConfidence === "HIGH",
      }),
  );
  rows = rows.slice(0, limit);

  let confirmed = 0;
  let uncertain = 0;
  let skipped = 0;

  for (const row of rows) {
    const site = row.websiteUrl || row.growthLead?.websiteUrl || row.sourceUrl;
    const listingHost = hostFromUrl(site);
    const timeZone = resolveTrustedListingTimeZone(row);
    if (!timeZone) {
      skipped += 1;
      continue;
    }
    const seeds = [
      row.websiteUrl,
      row.growthLead?.websiteUrl,
      row.sourceUrl,
      row.facebookUrl,
      row.instagramUrl,
      row.growthLead?.facebookUrl,
      row.growthLead?.instagramUrl,
    ].filter((u): u is string => Boolean(u?.trim()));
    const urls = expandOfficialEvidenceUrls(seeds, 12).filter((u) => crawlableOfficial(listingHost, u, row));
    if (urls.length === 0) {
      skipped += 1;
      continue;
    }

    let parsed: ReturnType<typeof parseExplicitScheduleFromText> = null;
    let sourceUrl: string | null = null;
    for (const url of urls) {
      const html = await discoveryFetchText(url, { timeoutMs: PAGE_TIMEOUT_MS });
      if (!html) continue;
      const pageText = stripHtml(html);
      const social = officialSocialUrl(row, url);
      const trust = evaluateFetchedEvidenceTrust({
        pageText,
        excerpt: null,
        onOfficialVenueDomain: officialEnough(listingHost, url) || social,
        sourceKind: social ? "official_social" : "official_website",
        placeIdentityStrong: true,
        geoConflict: false,
        nameOk: isPublicListingNameOk(row.name),
      });
      if (!trust.trusted) continue;
      const hit =
        parseExplicitScheduleFromHtml(html) || parseExplicitScheduleFromText(pageText);
      if (hit) {
        parsed = hit;
        sourceUrl = url;
        break;
      }
      for (const icsUrl of extractOfficialIcsUrls(html, url)) {
        if (!crawlableOfficial(listingHost, icsUrl, row)) continue;
        const ics = await discoveryFetchText(icsUrl, { timeoutMs: PAGE_TIMEOUT_MS, acceptCalendar: true });
        if (!ics) continue;
        const icsHit = parseExplicitScheduleFromIcs(ics);
        if (icsHit) {
          parsed = icsHit;
          sourceUrl = icsUrl;
          break;
        }
      }
      if (parsed) break;
    }

    if (!parsed || !sourceUrl) {
      uncertain += 1;
      continue;
    }

    const endTimeMin = explicitScheduleEndTimeMin(parsed);
    const now = new Date();
    const weekday = parsed.weekday as Weekday;
    const existing = await prisma.publicOpenMicSchedule.findFirst({
      where: { listingId: row.id, weekday },
      select: { id: true },
    });
    const description = parsed.endTimeMin
      ? `Confirmed from official source: ${parsed.raw}`
      : `Confirmed from official source: ${parsed.raw}. End time was not stated.`;

    if (existing) {
      await prisma.publicOpenMicSchedule.update({
        where: { id: existing.id },
        data: {
          startTimeMin: parsed.startTimeMin,
          endTimeMin,
          timeZone,
          signupMethod: parsed.signupMethod || row.signupMethod,
          isActive: true,
          lastVerifiedAt: now,
          sourceUrl,
          description,
        },
      });
    } else {
      await prisma.publicOpenMicSchedule.create({
        data: {
          listingId: row.id,
          weekday,
          startTimeMin: parsed.startTimeMin,
          endTimeMin,
          timeZone,
          signupMethod: parsed.signupMethod || row.signupMethod,
          isActive: true,
          lastVerifiedAt: now,
          sourceUrl,
          title: "Open mic",
          description,
        },
      });
    }

    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        lastVerifiedAt: now,
        ...(parsed.signupMethod ? { signupMethod: parsed.signupMethod } : {}),
      },
    });

    const page = `${appBaseUrl().replace(/\/$/, "")}/open-mics/${row.slug}`;
    await submitUrlsToIndexNow([page]).catch(() => undefined);
    confirmed += 1;
  }

  return { scanned: rows.length, confirmed, uncertain, skipped };
}

export async function enrichVerifiedListingSchedules(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<ScheduleEnrichResult> {
  const limit = Math.min(48, Math.max(0, opts?.limit ?? 24));
  if (limit <= 0) return { scanned: 0, confirmed: 0, uncertain: 0, skipped: 0 };
  return withPgAdvisoryLock(prisma, SCHEDULE_ENRICH_LOCK, { scanned: 0, confirmed: 0, uncertain: 0, skipped: 0 }, () =>
    enrichVerifiedListingSchedulesUnlocked(prisma, limit),
  );
}
