/**
 * Bounded official-site crawl helpers for outreach open-mic evidence enrichment.
 * Pure functions — no network. The tick runner fetches pages with these caps.
 */
import {
  classifyOutreachOpenMicEvidence,
  type OutreachOpenMicEvidenceResult,
} from "@/lib/growth/outreachOpenMicEvidence";
import { findOpenMicEventMatches } from "@/lib/growth/openMicPhraseSemantics";
import { classifyOutreachTargetIdentity } from "@/lib/growth/outreachTargetIdentity";
import { classifyOutreachNameQuality } from "@/lib/growth/outreachNameQuality";
import { classifyOutreachGeoIdentity } from "@/lib/growth/outreachGeoIdentity";

export const OUTREACH_EVIDENCE_MAX_PAGES = 8;
export const OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS = 8_000;
export const OUTREACH_EVIDENCE_LEAD_BUDGET_MS = 18_000;

export const OUTREACH_EVIDENCE_EVENT_PATHS = [
  "/open-mic",
  "/open-mics",
  "/openmic",
  "/events",
  "/calendar",
  "/events-calendar",
  "/schedule",
  "/live-music",
  "/music",
  "/comedy",
  "/entertainment",
  "/happenings",
  "/whats-on",
  "/weekly-events",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type OutreachEvidenceRecheckKind =
  | "permanent_skip"
  | "no_evidence_real_venue"
  | "tier_c"
  | "tier_b"
  | "tier_a"
  | "crawl_failed";

export type OutreachEvidenceState = {
  url: string | null;
  snippet: string | null;
  title: string | null;
  eventName: string | null;
  recurringLanguage: string | null;
  weekdayTime: string | null;
  sourceType: "official_website" | "official_social" | "none";
  evidenceDate: string | null;
  firstSeenAt: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  skipPermanent: boolean;
  skipReason: string | null;
  tier: string | null;
  confidence: number | null;
};

export type CrawledPage = {
  url: string;
  title: string;
  text: string;
};

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function hostsRelated(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.origin;
  } catch {
    return null;
  }
}

/** Homepage + likely event/calendar paths, same origin, bounded. */
export function expandOutreachEvidenceUrls(websiteUrl: string | null | undefined, maxUrls = OUTREACH_EVIDENCE_MAX_PAGES): string[] {
  const raw = websiteUrl?.trim();
  if (!raw) return [];
  const origin = originOf(raw);
  if (!origin) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const key = u.replace(/\/$/, "").toLowerCase();
    if (seen.has(key) || out.length >= maxUrls) return;
    seen.add(key);
    out.push(u);
  };
  push(raw.includes("://") ? raw : `https://${raw}`);
  for (const suffix of OUTREACH_EVIDENCE_EVENT_PATHS) {
    push(`${origin}${suffix}`);
  }
  return out.slice(0, maxUrls);
}

/** Keep only URLs on the venue's official host (and subdomains). */
export function filterSameDomainUrls(urls: string[], venueHost: string | null): string[] {
  if (!venueHost) return [];
  const v = venueHost.replace(/^www\./i, "").toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const h = hostOf(raw);
    if (!h || !hostsRelated(h, v)) continue;
    const key = raw.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw.split("#")[0]!);
  }
  return out;
}

export function mergeCrawlUrlPlan(
  websiteUrl: string | null | undefined,
  discoveredSameHostLinks: string[],
  maxUrls = OUTREACH_EVIDENCE_MAX_PAGES,
): string[] {
  const venueHost = hostOf(websiteUrl);
  const seeds = expandOutreachEvidenceUrls(websiteUrl, maxUrls);
  const discovered = filterSameDomainUrls(discoveredSameHostLinks, venueHost);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [...seeds, ...discovered]) {
    const key = u.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= maxUrls) break;
  }
  return out;
}

export type RobotsRules = { allow: string[]; disallow: string[] };

/** Parse User-agent: * (and MicStageDiscovery) Allow/Disallow groups. */
export function parseRobotsTxtForCrawler(text: string): RobotsRules {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  for (const line of lines) {
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || cur.allow.length || cur.disallow.length) {
        cur = { agents: [val.toLowerCase()], allow: [], disallow: [] };
        groups.push(cur);
      } else {
        cur.agents.push(val.toLowerCase());
      }
      continue;
    }
    if (!cur) continue;
    if (key === "allow") cur.allow.push(val || "/");
    if (key === "disallow") cur.disallow.push(val);
  }
  const match =
    groups.find((g) => g.agents.some((a) => a.startsWith("micstagediscovery"))) ||
    groups.find((g) => g.agents.includes("*")) ||
    { allow: [] as string[], disallow: [] as string[] };
  return { allow: match.allow, disallow: match.disallow };
}

export function robotsAllowsPath(pathname: string, rules: RobotsRules): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  let bestLen = -1;
  let allowed = true;
  for (const d of rules.disallow) {
    if (!d) continue;
    if (path.startsWith(d) && d.length >= bestLen) {
      bestLen = d.length;
      allowed = false;
    }
  }
  for (const a of rules.allow) {
    if (!a) continue;
    if (path.startsWith(a) && a.length >= bestLen) {
      bestLen = a.length;
      allowed = true;
    }
  }
  return allowed;
}

export function robotsAllowsUrl(url: string, rules: RobotsRules): boolean {
  try {
    return robotsAllowsPath(new URL(url).pathname || "/", rules);
  } catch {
    return false;
  }
}

export function outreachEvidenceRecheckDelayMs(kind: OutreachEvidenceRecheckKind): number {
  switch (kind) {
    case "permanent_skip":
      return 10 * 365 * DAY_MS;
    case "no_evidence_real_venue":
      return 45 * DAY_MS;
    case "tier_c":
      return 14 * DAY_MS;
    case "tier_b":
      return 45 * DAY_MS;
    case "tier_a":
      return 60 * DAY_MS;
    case "crawl_failed":
      return 7 * DAY_MS;
    default:
      return 45 * DAY_MS;
  }
}

export function nextOutreachEvidenceRecheckAt(kind: OutreachEvidenceRecheckKind, now = new Date()): Date {
  return new Date(now.getTime() + outreachEvidenceRecheckDelayMs(kind));
}

export function parseOutreachEvidenceState(hints: unknown): OutreachEvidenceState | null {
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return null;
  const raw = (hints as Record<string, unknown>).outreachEvidence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string): string | null => (typeof r[k] === "string" && r[k].trim() ? (r[k] as string) : null);
  return {
    url: str("url"),
    snippet: str("snippet"),
    title: str("title"),
    eventName: str("eventName"),
    recurringLanguage: str("recurringLanguage"),
    weekdayTime: str("weekdayTime"),
    sourceType: r.sourceType === "official_social" ? "official_social" : r.sourceType === "official_website" ? "official_website" : "none",
    evidenceDate: str("evidenceDate"),
    firstSeenAt: str("firstSeenAt"),
    lastCheckedAt: str("lastCheckedAt"),
    nextCheckAt: str("nextCheckAt"),
    skipPermanent: r.skipPermanent === true,
    skipReason: str("skipReason"),
    tier: str("tier"),
    confidence: typeof r.confidence === "number" ? r.confidence : null,
  };
}

export function isOutreachEvidenceRecheckDue(
  state: Pick<OutreachEvidenceState, "skipPermanent" | "nextCheckAt"> | null,
  now = new Date(),
): boolean {
  if (!state) return true;
  if (state.skipPermanent) return false;
  if (!state.nextCheckAt) return true;
  const next = new Date(state.nextCheckAt);
  if (Number.isNaN(next.getTime())) return true;
  return now.getTime() >= next.getTime();
}

const RECURRING_SNIP =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|first\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|each\s+week)\b/i;
const WEEKDAY_TIME =
  /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)(?:\s+(?:at|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i;

export function excerptAroundOpenMic(text: string, max = 420): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const matches = findOpenMicEventMatches(collapsed);
  const needle = matches[0]?.phrase ?? "open mic";
  const idx = collapsed.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return collapsed.slice(0, max);
  const start = Math.max(0, idx - 80);
  return collapsed.slice(start, start + max).trim();
}

export function detectRecurringLanguage(text: string): string | null {
  const m = RECURRING_SNIP.exec(text);
  return m?.[0] ?? null;
}

export function detectWeekdayTime(text: string): string | null {
  const m = WEEKDAY_TIME.exec(text);
  return m?.[0] ?? null;
}

export type PermanentSkipReason =
  | "directory"
  | "service_company"
  | "chamber_tourism"
  | "festival_event_not_venue"
  | "geography_conflict"
  | "name_quality"
  | null;

export function permanentSkipReasonForLead(input: {
  name: string;
  leadType: "VENUE" | "PROMOTER_ACCOUNT" | "ARTIST";
  websiteUrl?: string | null;
  websiteHostNormalized?: string | null;
  contactEmailNormalized?: string | null;
  city?: string | null;
  region?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  listingName?: string | null;
}): PermanentSkipReason {
  const ident = classifyOutreachTargetIdentity({
    name: input.name,
    leadType: input.leadType,
    websiteUrl: input.websiteUrl,
    websiteHostNormalized: input.websiteHostNormalized,
    contactEmailNormalized: input.contactEmailNormalized,
    city: input.city,
    region: input.region,
    formattedAddress: input.formattedAddress,
    googlePlaceId: input.googlePlaceId,
    listingName: input.listingName,
  });
  if (ident.decision === "ineligible") {
    if (ident.reason === "directory_aggregator") return "directory";
    if (ident.reason === "service_company") return "service_company";
    if (ident.reason === "chamber_tourism") return "chamber_tourism";
    return null;
  }
  const nameQ = classifyOutreachNameQuality({ name: input.name, listingName: input.listingName });
  if (nameQ.festival) return "festival_event_not_venue";
  if (!nameQ.ok) return "name_quality";
  const geo = classifyOutreachGeoIdentity({
    name: input.name,
    city: input.city,
    region: input.region,
    formattedAddress: input.formattedAddress,
    websiteHostNormalized: input.websiteHostNormalized,
    websiteUrl: input.websiteUrl,
  });
  if (geo.conflict) return "geography_conflict";
  return null;
}

export function socialFallbackUrl(input: {
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  identityStrong: boolean;
}): string | null {
  if (!input.identityStrong) return null;
  const fb = input.facebookUrl?.trim() || null;
  const ig = input.instagramUrl?.trim() || null;
  const hostOk = (u: string) => /facebook\.com|fb\.com|instagram\.com/i.test(u);
  if (fb && hostOk(fb)) return fb;
  if (ig && hostOk(ig)) return ig;
  return null;
}

const TIER_RANK: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, none: 0 };

/** Classify crawled official (or social fallback) pages; first Tier A wins. */
export function classifyCrawledPagesForOutreach(input: {
  name: string;
  websiteUrl: string | null;
  websiteHostNormalized: string | null;
  city?: string | null;
  region?: string | null;
  pages: CrawledPage[];
}): OutreachOpenMicEvidenceResult {
  let best: OutreachOpenMicEvidenceResult | null = null;
  for (const page of input.pages) {
    const snippet = excerptAroundOpenMic(page.text);
    const result = classifyOutreachOpenMicEvidence({
      name: input.name,
      websiteUrl: input.websiteUrl,
      websiteHostNormalized: input.websiteHostNormalized,
      city: input.city,
      region: input.region,
      sourceUrl: page.url,
      sourceTitle: page.title,
      sourceSnippet: snippet,
      about: page.text.slice(0, 8_000),
    });
    if (!best || (TIER_RANK[result.tier] ?? 0) > (TIER_RANK[best.tier] ?? 0)) {
      best = result;
    }
    if (result.tier === "A" && result.autoSend) return result;
  }
  return (
    best ?? {
      tier: "none",
      autoSend: false,
      rejectClass: "no_target_bound_open_mic_evidence",
      summary: "no pages classified",
      evidenceUrl: null,
      evidenceDate: null,
      matchedPhrase: null,
      falsePositive: null,
    }
  );
}

export function recheckKindFromEvidence(result: OutreachOpenMicEvidenceResult, crawled: boolean): OutreachEvidenceRecheckKind {
  if (result.tier === "A") return "tier_a";
  if (result.tier === "B") return "tier_b";
  if (result.tier === "C") return "tier_c";
  if (!crawled) return "crawl_failed";
  return "no_evidence_real_venue";
}
