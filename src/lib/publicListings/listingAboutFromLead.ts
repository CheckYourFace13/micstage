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

/** Crawler / discovery / import wording that must never be the public listing description. */
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
  // Full import tags and truncated remnants (e.g. "[ import .073Z b…")
  /\[[^\]]*(?:claude_csv|import(?:\s+batch)?|importkey|batch\s*=|file\s*=)[^\]]*\]?/gi,
  /\[[^\]]{0,40}\bimport\b[^\]]{0,80}(?:…|\.{2,}|$)/gi,
  /\bclaude_csv\b/gi,
  /\bbatch\s*=\s*[a-z0-9_-]+/gi,
  /\bfile\s*=\s*\S+/gi,
  /\bimport\s+batch\b[^.]*\.?/gi,
  /\binternal note:?\s*[^.]*\.?/gi,
  /\bdiscovery notes?:?\s*[^.]*\.?/gi,
  /\bparser notes?:?\s*[^.]*\.?/gi,
  /\bquality gate\b[^.]*\.?/gi,
  /\bverification gate\b[^.]*\.?/gi,
  /\bno public email\b/gi,
  /\bOpenMic(?:Chicago|X)\b/gi,
  /\blisted on\s+openmicx\b/gi,
  /\blisted on\s*;?/gi,
  /\bOfficial [^.]*\blists? direct contact email\.?/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\btwo emails?\b[^.]*\.?/gi,
  /\bemails?\s+(found|directly)\b[^.]*\.?/gi,
  /\blegacyContactRole\s*=[^.|]*\|?/gi,
  /\bopenMic(?:Type|Day|Time)\s*=[^.|]*\|?/gi,
  /\b(?:phone|address|category)\s*=[^.|]*\|?/gi,
  /\bVisit Us\s*[·•]\s*Contact\s*[·•]\s*Privacy Policy\b[^.]*\.?/gi,
  /\bWork with Us\b\.?/gi,
  /\bSign Up For Exclusives\b[^.]*\.?/gi,
  /\bconfirmed on\s*;?/gi,
  /\bPerformers:\s*[^.]{0,120}\.?/gi,
];

const INTERNAL_SOURCE =
  /autonomous|web[\s_-]?search|crawl|growth[\s_-]?discover|enrichment|serpapi|brave|discovered via|nationwide discovery|claude[_-]?csv|micstage\s+growth|import\s+batch/i;

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
  // Drop dangling incomplete bracket tags left by truncation.
  t = t.replace(/\[[^\]]*$/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  // Collapse duplicated sentences/clauses.
  t = dedupeRepeatedClauses(t);
  if (t.length < 40) return null;
  if (/https?:\/\//i.test(t)) return null;
  if (/events?\s*&\s*tickets/i.test(t)) return null;
  if (/[<>]/.test(t)) return null;
  // Hard drop if provenance/import/ops markers survived scrubbing.
  if (
    /\bclaude_csv\b|\bbatch\s*=|\bimportKey\b|\binternal note\b|\bdiscovery note\b|\bparser\b|\bno public email\b|\b\[?\s*import\b|\blegacyContactRole\b|\bopenMicType\b|\bemails?\s+found\b|\bOpenMicX\b|\blisted on\s*;|\bcontact email\b/i.test(
      t,
    )
  ) {
    return null;
  }
  // Pipe-delimited scrape metadata (role=… | phone=…) is never public copy.
  if (/\b[a-zA-Z][a-zA-Z0-9_]*\s*=\s*[^|]{1,80}\|/.test(t)) return null;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return null;
  if (t.length <= 600) return t;
  // Truncate on a word boundary so we never leave mid-tag crumbs.
  const cut = t.slice(0, 597);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 400 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function dedupeRepeatedClauses(text: string): string {
  const parts = text
    .split(/(?<=[.!;])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    // Also catch semicolon-joined duplicates without sentence breaks.
    const semi = text.split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean);
    if (semi.length > 1) {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const p of semi) {
        const key = p.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
      return out.join("; ");
    }
    return text;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(" ");
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
