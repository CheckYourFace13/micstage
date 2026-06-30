import type {
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
} from "@/generated/prisma/client";

const PERFORMANCE_LABEL: Record<GrowthLeadPerformanceTag, string> = {
  MUSIC: "live music",
  COMEDY: "comedy",
  POETRY: "poetry",
  VARIETY: "variety acts",
};

function tierIntro(tier: GrowthLeadOpenMicSignalTier | null): string | null {
  switch (tier) {
    case "EXPLICIT_OPEN_MIC":
      return "Open mic venue identified from public listings and web search.";
    case "STRONG_LIVE_EVENT":
      return "Live music venue with open mic or performer signup signals.";
    default:
      return null;
  }
}

function formatSourceLabel(source: string): string {
  return source.replace(/_crawl$/i, "").replace(/_/g, " ").trim();
}

/**
 * Build a short public `about` blurb from growth-lead discovery metadata.
 */
export function buildListingAboutFromLead(lead: {
  openMicSignalTier: GrowthLeadOpenMicSignalTier | null;
  performanceTags: GrowthLeadPerformanceTag[];
  internalNotes: string | null;
  discoveryHints: unknown;
  source: string | null;
}): string | null {
  const parts: string[] = [];

  const intro = tierIntro(lead.openMicSignalTier);
  if (intro) parts.push(intro);

  if (lead.performanceTags.length) {
    const labels = lead.performanceTags.map((t) => PERFORMANCE_LABEL[t] ?? t.toLowerCase());
    parts.push(`Performers: ${labels.join(", ")}.`);
  }

  if (lead.discoveryHints && typeof lead.discoveryHints === "object" && !Array.isArray(lead.discoveryHints)) {
    const roles = (lead.discoveryHints as Record<string, unknown>).publicRoleHints;
    if (Array.isArray(roles) && roles.length) {
      const clean = roles
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .slice(0, 6);
      if (clean.length) parts.push(`Also known for: ${clean.join(", ")}.`);
    }
  }

  const notes = lead.internalNotes?.trim();
  if (notes?.includes("Snippet:")) {
    const snippet = notes.split("Snippet:")[1]?.split(". Market")[0]?.split(". Query:")[0]?.trim();
    if (snippet && snippet.length >= 24) {
      parts.push(snippet.endsWith(".") ? snippet : `${snippet}.`);
    }
  }

  if (lead.source?.trim()) {
    parts.push(`Discovered via ${formatSourceLabel(lead.source)}.`);
  }

  const about = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!about) return null;
  return about.length > 600 ? `${about.slice(0, 597)}…` : about;
}
