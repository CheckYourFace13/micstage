import type {
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
} from "@/generated/prisma/client";

const PERFORMANCE_LABEL: Record<GrowthLeadPerformanceTag, string> = {
  MUSIC: "live music",
  COMEDY: "comedy",
  POETRY: "poetry",
  VARIETY: "variety",
};

/** Crawler / discovery wording that must never be the public listing description. */
const PUBLIC_ABOUT_NOISE: RegExp[] = [
  /open[\s-]?mic venue identified from public listings and web search\.?/gi,
  /live music venue with open mic or performer signup signals\.?/gi,
  /open[\s\u2013-]?mic[\s\u2013-]*targeted nationwide discovery\.?/gi,
  /discovered via [^.]*\.?/gi,
  /\bquery:\s*[^.]*\.?/gi,
  /\btier\s+[a-z0-9_]+\b/gi,
  /\bmarket\s+[a-z0-9-]+\b/gi,
  /\[micstage_email_meta\][^.]*\.?/gi,
  /\bautonomous\s+web\s+search\b/gi,
  /\bdiscovered via crawl\b/gi,
  /\bpublic listings and web search\b/gi,
  /\bgrowth discovery\b/gi,
  /\benrichment\s+[a-z0-9_]+\b/gi,
];

const INTERNAL_SOURCE =
  /autonomous|web[\s_-]?search|crawl|growth[\s_-]?discover|enrichment|serpapi|brave|discovered via|nationwide discovery/i;

const SEARCH_ENGINE_HOST =
  /(^|\.)(google|bing|duckduckgo|yahoo|serpapi|brave)\./i;

/**
 * Strip crawler boilerplate from stored `about` text so existing rows stay
 * usable on public pages without inventing new copy.
 */
export function sanitizePublicListingAbout(about: string | null | undefined): string | null {
  if (!about?.trim()) return null;
  let t = about.trim();
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/&amp;/gi, "&");
  t = t.replace(/&#x27;|&apos;/gi, "'");
  t = t.replace(/&quot;/g, '"');
  for (const re of PUBLIC_ABOUT_NOISE) t = t.replace(re, " ");
  t = t.replace(/discovered via\s+\S[\s\S]*/gi, " ");
  t = t.replace(/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\b/g, " ");
  t = t.replace(/\bPerformers:\s*[^.]{0,120}\./gi, " ");
  t = t.replace(/\bAlso known for:\s*[^.]{0,120}\./gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < 40) return null;
  if (/https?:\/\//i.test(t)) return null;
  if (/events?\s*&\s*tickets/i.test(t)) return null;
  if (/[<>]/.test(t)) return null;
  return t.length > 600 ? `${t.slice(0, 597)}…` : t;
}

/** Hide internal pipeline labels; keep a human source name when it looks like a real site/org. */
export function publicListingSourceLabel(sourceName: string | null | undefined): string | null {
  const name = sourceName?.trim();
  if (!name) return null;
  if (INTERNAL_SOURCE.test(name)) return null;
  if (name.length > 80) return null;
  return name;
}

export function isPublicListingSourceUrl(url: string | null | undefined): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !SEARCH_ENGINE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

function roleHintsLookPublic(roles: string[]): string[] {
  return roles
    .map((r) => r.trim())
    .filter((r) => r.length >= 3 && r.length <= 40)
    .filter((r) => !INTERNAL_SOURCE.test(r))
    .filter((r) => !/identified from|signup signals|snippet:/i.test(r))
    .slice(0, 4);
}

/**
 * Build a short public `about` blurb from growth-lead metadata.
 * Never includes crawler language or raw search snippets.
 */
export function buildListingAboutFromLead(lead: {
  openMicSignalTier: GrowthLeadOpenMicSignalTier | null;
  performanceTags: GrowthLeadPerformanceTag[];
  internalNotes: string | null;
  discoveryHints: unknown;
  source: string | null;
}): string | null {
  void lead.openMicSignalTier;
  void lead.internalNotes;
  void lead.source;

  const parts: string[] = [];

  if (lead.performanceTags.length) {
    const labels = lead.performanceTags.map((t) => PERFORMANCE_LABEL[t] ?? t.toLowerCase());
    parts.push(`Typical formats: ${labels.join(", ")}.`);
  }

  if (lead.discoveryHints && typeof lead.discoveryHints === "object" && !Array.isArray(lead.discoveryHints)) {
    const roles = (lead.discoveryHints as Record<string, unknown>).publicRoleHints;
    if (Array.isArray(roles) && roles.length) {
      const clean = roleHintsLookPublic(roles.filter((r): r is string => typeof r === "string"));
      if (clean.length) parts.push(`Also known for: ${clean.join(", ")}.`);
    }
  }

  const about = parts.join(" ").replace(/\s+/g, " ").trim();
  return sanitizePublicListingAbout(about);
}
