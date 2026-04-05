import type { GrowthLeadPerformanceTag, GrowthLeadSourceKind, GrowthLeadType } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";

const SOURCE_KINDS = new Set<string>([
  "MANUAL_ADMIN",
  "CSV_IMPORT",
  "WEBSITE_CONTACT",
  "SOCIAL_PROFILE",
  "EVENT_LISTING",
  "SCHEDULED_JOB",
]);

function parseTags(raw: unknown): GrowthLeadPerformanceTag[] {
  if (!Array.isArray(raw)) return [];
  const out: GrowthLeadPerformanceTag[] = [];
  for (const x of raw) {
    const u = String(x).toUpperCase();
    if (u === "MUSIC" || u === "COMEDY" || u === "POETRY" || u === "VARIETY") out.push(u);
  }
  return [...new Set(out)];
}

function parseCandidate(row: unknown, fallbackKind: GrowthLeadSourceKind): GrowthLeadCandidate | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  const lt = String(o.leadType ?? "").toUpperCase();
  if (lt !== "VENUE" && lt !== "ARTIST" && lt !== "PROMOTER_ACCOUNT") return null;
  const slug = typeof o.discoveryMarketSlug === "string" ? o.discoveryMarketSlug.trim() : "";
  if (!slug) return null;
  const sk = String(o.sourceKind ?? fallbackKind).toUpperCase();
  const sourceKind = SOURCE_KINDS.has(sk) ? (sk as GrowthLeadSourceKind) : fallbackKind;
  return {
    leadType: lt as GrowthLeadType,
    name,
    contactEmailNormalized: typeof o.contactEmail === "string" ? o.contactEmail : null,
    contactUrl: typeof o.contactUrl === "string" ? o.contactUrl : null,
    websiteUrl: typeof o.websiteUrl === "string" ? o.websiteUrl : null,
    instagramUrl: typeof o.instagramUrl === "string" ? o.instagramUrl : null,
    youtubeUrl: typeof o.youtubeUrl === "string" ? o.youtubeUrl : null,
    tiktokUrl: typeof o.tiktokUrl === "string" ? o.tiktokUrl : null,
    city: typeof o.city === "string" ? o.city : null,
    suburb: typeof o.suburb === "string" ? o.suburb : null,
    region: typeof o.region === "string" ? o.region : null,
    discoveryMarketSlug: slug,
    source: typeof o.source === "string" ? o.source : "growth_stub_json",
    sourceKind,
    fitScore: typeof o.fitScore === "number" ? o.fitScore : null,
    discoveryConfidence: typeof o.discoveryConfidence === "number" ? o.discoveryConfidence : null,
    performanceTags: parseTags(o.performanceTags),
    importKey: typeof o.importKey === "string" ? o.importKey : null,
    internalNotes: typeof o.internalNotes === "string" ? o.internalNotes : null,
  };
}

function readStubCandidatesFromEnv(): GrowthLeadCandidate[] {
  const raw = process.env.GROWTH_DISCOVERY_STUB_LEADS_JSON?.trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: GrowthLeadCandidate[] = [];
    for (const row of data) {
      const c = parseCandidate(row, "SCHEDULED_JOB");
      if (c) out.push(c);
    }
    return out;
  } catch {
    console.error("[growth stub] invalid GROWTH_DISCOVERY_STUB_LEADS_JSON");
    return [];
  }
}

export function createStubJsonAdapter(leadType: GrowthLeadType): GrowthLeadSourceAdapter {
  return {
    id: `stub_json_${leadType}`,
    leadType,
    async discover(ctx) {
      const all = readStubCandidatesFromEnv();
      return all.filter(
        (c) =>
          c.leadType === ctx.leadType &&
          c.discoveryMarketSlug.toLowerCase() === ctx.discoveryMarketSlug.toLowerCase(),
      );
    },
  };
}
