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
import {
  evaluateScheduleTimeSanity,
  markTimeUnconfirmedDescription,
  scheduleDescriptionIsTimeUnconfirmed,
} from "@/lib/publicListings/scheduleTimeSanity";
import { SCHEDULE_ENRICH_LOCK, withPgAdvisoryLock } from "@/lib/growth/enrichmentLock";
import { readDiscoveryCursor, writeDiscoveryCursor, readDiscoveryCursorJson, writeDiscoveryCursorJson } from "@/lib/growth/discovery/discoveryCursor";
import { chicagoLast24hWindow } from "@/lib/ownerSummary/chicagoWindow";

const PAGE_TIMEOUT_MS = 8_000;

export type ScheduleEnrichResult = {
  scanned: number;
  confirmed: number;
  uncertain: number;
  skipped: number;
  officialPagesFetched: number;
  explicitFound: number;
  ambiguous: number;
  fetchBlocked: number;
  noScheduleFound: number;
};

export const EMPTY_SCHEDULE_ENRICH_RESULT: ScheduleEnrichResult = {
  scanned: 0,
  confirmed: 0,
  uncertain: 0,
  skipped: 0,
  officialPagesFetched: 0,
  explicitFound: 0,
  ambiguous: 0,
  fetchBlocked: 0,
  noScheduleFound: 0,
};

const SCHEDULE_CURSOR_ADAPTER = "schedule_enrich";
const SCHEDULE_CURSOR_MARKET = "verified";
const SCHEDULE_ROTATE_KEY = "rotateId";
const SCHEDULE_DAY_STATS_KEY = "day_funnel";

export type ScheduleRecoveryDayStats = {
  chicagoDate: string;
  unscheduledVerified: number;
  scanned: number;
  officialPagesFetched: number;
  explicitFound: number;
  created: number;
  ambiguous: number;
  fetchBlocked: number;
  noScheduleFound: number;
};

export function emptyScheduleRecoveryDayStats(chicagoDate: string): ScheduleRecoveryDayStats {
  return {
    chicagoDate,
    unscheduledVerified: 0,
    scanned: 0,
    officialPagesFetched: 0,
    explicitFound: 0,
    created: 0,
    ambiguous: 0,
    fetchBlocked: 0,
    noScheduleFound: 0,
  };
}

/**
 * Fair rotation plus priority fill so old listings cannot starve.
 * Half the batch walks the cursor; the rest are the highest-scoring remainder.
 */
export function rotateUnscheduledBatch<T extends { id: string }>(
  rows: T[],
  cursorId: string | null,
  limit: number,
  score: (row: T) => number,
): { batch: T[]; nextCursorId: string | null } {
  if (rows.length === 0 || limit <= 0) return { batch: [], nextCursorId: cursorId };
  const start = cursorId ? rows.findIndex((r) => r.id > cursorId) : 0;
  const origin = start >= 0 ? start : 0;
  const fairCount = Math.max(1, Math.ceil(limit / 2));
  const rotated: T[] = [];
  for (let i = 0; i < rows.length && rotated.length < fairCount; i += 1) {
    rotated.push(rows[(origin + i) % rows.length]!);
  }
  const rotatedIds = new Set(rotated.map((r) => r.id));
  const priority = rows
    .filter((r) => !rotatedIds.has(r.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(0, limit - rotated.length));
  const nextCursorId = rotated.length > 0 ? rotated[rotated.length - 1]!.id : cursorId;
  return { batch: [...priority, ...rotated], nextCursorId };
}

function looksAmbiguousOpenMicSchedule(text: string): boolean {
  const hasOpenMic = /open[\s-]?mic/i.test(text);
  const hasDay = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
  return hasOpenMic && hasDay;
}

export async function readScheduleRecoveryDayStats(
  prisma: PrismaClient,
  now = new Date(),
): Promise<ScheduleRecoveryDayStats> {
  const { reportChicagoDate } = chicagoLast24hWindow(now);
  const prev = await readDiscoveryCursorJson<ScheduleRecoveryDayStats>(
    prisma,
    SCHEDULE_CURSOR_ADAPTER,
    SCHEDULE_CURSOR_MARKET,
    SCHEDULE_DAY_STATS_KEY,
  );
  if (prev?.chicagoDate === reportChicagoDate) return prev;
  return emptyScheduleRecoveryDayStats(reportChicagoDate);
}

async function recordScheduleRecoveryDayStats(
  prisma: PrismaClient,
  unscheduledVerified: number,
  delta: ScheduleEnrichResult,
): Promise<void> {
  const { reportChicagoDate } = chicagoLast24hWindow();
  const prev = await readScheduleRecoveryDayStats(prisma);
  const base = prev.chicagoDate === reportChicagoDate ? prev : emptyScheduleRecoveryDayStats(reportChicagoDate);
  await writeDiscoveryCursorJson(prisma, SCHEDULE_CURSOR_ADAPTER, SCHEDULE_CURSOR_MARKET, SCHEDULE_DAY_STATS_KEY, {
    chicagoDate: reportChicagoDate,
    unscheduledVerified,
    scanned: base.scanned + delta.scanned,
    officialPagesFetched: base.officialPagesFetched + delta.officialPagesFetched,
    explicitFound: base.explicitFound + delta.explicitFound,
    created: base.created + delta.confirmed,
    ambiguous: base.ambiguous + delta.ambiguous,
    fetchBlocked: base.fetchBlocked + delta.fetchBlocked,
    noScheduleFound: base.noScheduleFound + delta.noScheduleFound,
  });
}

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

  const allRows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      removedAt: null,
      claimedVenueId: null,
      OR: [
        { schedules: { none: { isActive: true } } },
        { schedules: { some: { isActive: true, description: { startsWith: "TIME_UNCONFIRMED" } } } },
      ],
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
    orderBy: { id: "asc" },
  });

  const cursorId = await readDiscoveryCursor(
    prisma,
    SCHEDULE_CURSOR_ADAPTER,
    SCHEDULE_CURSOR_MARKET,
    SCHEDULE_ROTATE_KEY,
  );
  const { batch: rows, nextCursorId } = rotateUnscheduledBatch(
    allRows,
    cursorId,
    limit,
    (row) =>
      scheduleMiningPriorityScore({
        ...row,
        highContact: row.growthLead?.contactEmailConfidence === "HIGH",
      }),
  );
  if (nextCursorId) {
    await writeDiscoveryCursor(
      prisma,
      SCHEDULE_CURSOR_ADAPTER,
      SCHEDULE_CURSOR_MARKET,
      SCHEDULE_ROTATE_KEY,
      nextCursorId,
    );
  }

  let confirmed = 0;
  let uncertain = 0;
  let skipped = 0;
  let officialPagesFetched = 0;
  let explicitFound = 0;
  let ambiguous = 0;
  let fetchBlocked = 0;
  let noScheduleFound = 0;

  try {
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
    let fetchedAny = false;
    let fetchFailedAll = true;
    let ambiguousPage = false;
    for (const url of urls) {
      const html = await discoveryFetchText(url, { timeoutMs: PAGE_TIMEOUT_MS });
      if (!html) continue;
      fetchedAny = true;
      fetchFailedAll = false;
      officialPagesFetched += 1;
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
      if (looksAmbiguousOpenMicSchedule(pageText)) ambiguousPage = true;
      for (const icsUrl of extractOfficialIcsUrls(html, url)) {
        if (!crawlableOfficial(listingHost, icsUrl, row)) continue;
        const ics = await discoveryFetchText(icsUrl, { timeoutMs: PAGE_TIMEOUT_MS, acceptCalendar: true });
        if (!ics) continue;
        officialPagesFetched += 1;
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
      if (!fetchedAny && fetchFailedAll) fetchBlocked += 1;
      else if (ambiguousPage) ambiguous += 1;
      else noScheduleFound += 1;
      uncertain += 1;
      continue;
    }
    explicitFound += 1;

    const endTimeMin = explicitScheduleEndTimeMin(parsed);
    const now = new Date();
    const weekday = parsed.weekday as Weekday;
    const existing = await prisma.publicOpenMicSchedule.findFirst({
      where: { listingId: row.id, weekday },
      select: { id: true, isActive: true, description: true },
    });
    const baseDescription = parsed.endTimeMin
      ? `Confirmed from official source: ${parsed.raw}`
      : `Confirmed from official source: ${parsed.raw}. End time was not stated.`;
    const sanity = evaluateScheduleTimeSanity({
      startTimeMin: parsed.startTimeMin,
      endTimeMin,
      timeZone,
      listingLat: row.lat,
      listingLng: row.lng,
      rawText: parsed.raw,
    });
    if (
      !sanity.ok &&
      existing?.isActive &&
      !scheduleDescriptionIsTimeUnconfirmed(existing.description)
    ) {
      uncertain += 1;
      continue;
    }
    const description = sanity.ok
      ? baseDescription
      : markTimeUnconfirmedDescription(baseDescription, sanity.reasons);

    if (existing) {
      await prisma.publicOpenMicSchedule.update({
        where: { id: existing.id },
        data: {
          startTimeMin: parsed.startTimeMin,
          endTimeMin,
          timeZone,
          signupMethod: parsed.signupMethod || row.signupMethod,
          isActive: true,
          ...(sanity.ok ? { lastVerifiedAt: now } : {}),
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

    if (!sanity.ok) {
      uncertain += 1;
      continue;
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
  } finally {
    const result: ScheduleEnrichResult = {
      scanned: rows.length,
      confirmed,
      uncertain,
      skipped,
      officialPagesFetched,
      explicitFound,
      ambiguous,
      fetchBlocked,
      noScheduleFound,
    };
    await recordScheduleRecoveryDayStats(prisma, allRows.length, result).catch(() => undefined);
  }

  const result: ScheduleEnrichResult = {
    scanned: rows.length,
    confirmed,
    uncertain,
    skipped,
    officialPagesFetched,
    explicitFound,
    ambiguous,
    fetchBlocked,
    noScheduleFound,
  };
  return result;
}

export async function enrichVerifiedListingSchedules(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<ScheduleEnrichResult> {
  const limit = Math.min(48, Math.max(0, opts?.limit ?? 24));
  if (limit <= 0) return { ...EMPTY_SCHEDULE_ENRICH_RESULT };
  return withPgAdvisoryLock(prisma, SCHEDULE_ENRICH_LOCK, { ...EMPTY_SCHEDULE_ENRICH_RESULT }, () =>
    enrichVerifiedListingSchedulesUnlocked(prisma, limit),
  );
}
