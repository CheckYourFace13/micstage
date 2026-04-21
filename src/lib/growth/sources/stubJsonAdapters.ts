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

const MAX_STUB_JSON_CHARS = 1_500_000;

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
  const slugRaw = typeof o.discoveryMarketSlug === "string" ? o.discoveryMarketSlug.trim() : "";
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
    ...(slugRaw ? { discoveryMarketSlug: slugRaw } : {}),
    source: typeof o.source === "string" ? o.source : "growth_stub_json",
    sourceKind,
    fitScore: typeof o.fitScore === "number" ? o.fitScore : null,
    discoveryConfidence: typeof o.discoveryConfidence === "number" ? o.discoveryConfidence : null,
    performanceTags: parseTags(o.performanceTags),
    importKey: typeof o.importKey === "string" ? o.importKey : null,
    internalNotes: typeof o.internalNotes === "string" ? o.internalNotes : null,
  };
}

/** Normalize env JSON: BOM strip, root array or common wrapper keys. */
function parseStubJsonToRows(raw: string): unknown[] {
  const t = raw.replace(/^\uFEFF/, "").trim();
  if (!t) return [];
  if (t.length > MAX_STUB_JSON_CHARS) {
    console.error(
      `[growth stub] GROWTH_DISCOVERY_STUB_LEADS_JSON exceeds ${MAX_STUB_JSON_CHARS} chars; refusing parse (split batches or use CSV import).`,
    );
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch (e) {
    console.error("[growth stub] invalid JSON in GROWTH_DISCOVERY_STUB_LEADS_JSON", e);
    return [];
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const keys = ["leads", "rows", "growthLeads", "candidates", "items", "data"] as const;
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  console.error("[growth stub] GROWTH_DISCOVERY_STUB_LEADS_JSON must be an array or { leads: [...] }");
  return [];
}

let stubEnvMemo: { raw: string; out: GrowthLeadCandidate[] } | null = null;

function readStubCandidatesFromEnv(): GrowthLeadCandidate[] {
  const raw = process.env.GROWTH_DISCOVERY_STUB_LEADS_JSON?.trim() ?? "";
  if (!raw) return [];
  if (stubEnvMemo?.raw === raw) return stubEnvMemo.out;

  const rows = parseStubJsonToRows(raw);
  const out: GrowthLeadCandidate[] = [];
  for (const row of rows) {
    const c = parseCandidate(row, "SCHEDULED_JOB");
    if (c) out.push(c);
  }
  if (rows.length > 0 && out.length === 0) {
    console.warn("[growth stub] parsed JSON rows but no valid lead candidates (check leadType, name, discoveryMarketSlug)");
  } else if (out.length > 0) {
    console.info(`[growth stub] loaded ${out.length} stub JSON candidate(s) from env`);
  }
  stubEnvMemo = { raw, out };
  return out;
}

export function createStubJsonAdapter(leadType: GrowthLeadType): GrowthLeadSourceAdapter {
  return {
    id: `stub_json_${leadType}`,
    leadType,
    async discover(ctx) {
      const all = readStubCandidatesFromEnv();
      return all.filter((c) => {
        if (c.leadType !== ctx.leadType) return false;
        const cs = c.discoveryMarketSlug?.trim().toLowerCase();
        if (!cs) return true;
        return cs === ctx.discoveryMarketSlug.toLowerCase();
      });
    },
  };
}
