import type {
  GrowthLeadContactQuality,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  GrowthLeadSourceKind,
  GrowthLeadType,
} from "@/generated/prisma/client";

export type ParsedGrowthLeadRow = {
  rowIndex: number;
  name: string;
  leadType: GrowthLeadType;
  contactEmailNormalized: string | null;
  contactUrl: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
  city: string | null;
  region: string | null;
  discoveryMarketSlug: string | null;
  source: string | null;
  fitScore: number | null;
  performanceTags: GrowthLeadPerformanceTag[];
  importKey: string | null;
  suburb: string | null;
};

export type CsvImportDefaults = {
  discoveryMarketSlug?: string | null;
  city?: string | null;
  region?: string | null;
  source?: string | null;
  performanceTags?: GrowthLeadPerformanceTag[];
  suburb?: string | null;
};

function mergeTags(
  row: GrowthLeadPerformanceTag[],
  defaults: GrowthLeadPerformanceTag[] | undefined,
): GrowthLeadPerformanceTag[] {
  if (!defaults?.length) return row;
  return [...new Set([...defaults, ...row])];
}

const TAG_MAP: Record<string, GrowthLeadPerformanceTag> = {
  MUSIC: "MUSIC",
  COMEDY: "COMEDY",
  POETRY: "POETRY",
  VARIETY: "VARIETY",
};

function parseTags(raw: string | undefined): GrowthLeadPerformanceTag[] {
  if (!raw?.trim()) return [];
  const out: GrowthLeadPerformanceTag[] = [];
  for (const part of raw.split(/[,|]/)) {
    const k = part.trim().toUpperCase();
    if (TAG_MAP[k]) out.push(TAG_MAP[k]);
  }
  return out;
}

function parseLeadType(raw: string | undefined): GrowthLeadType | null {
  const u = raw?.trim().toUpperCase().replace(/\s+/g, "_");
  if (u === "VENUE") return "VENUE";
  if (u === "ARTIST") return "ARTIST";
  if (u === "PROMOTER_ACCOUNT" || u === "PROMOTER") return "PROMOTER_ACCOUNT";
  return null;
}

/** Minimal CSV: comma-separated, no embedded commas in fields. First row = headers. */
export function parseGrowthLeadsFromCsv(
  text: string,
  defaults?: CsvImportDefaults,
): { rows: ParsedGrowthLeadRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);

  const rows: ParsedGrowthLeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const get = (h: string) => {
      const j = idx(h);
      return j >= 0 ? cells[j] : undefined;
    };

    const name = get("name")?.trim();
    if (!name) {
      errors.push(`Row ${i + 1}: missing name`);
      continue;
    }

    const lt = parseLeadType(get("leadtype") ?? get("lead_type"));
    if (!lt) {
      errors.push(`Row ${i + 1}: invalid leadType (use VENUE, ARTIST, PROMOTER_ACCOUNT)`);
      continue;
    }

    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = get(k)?.trim();
        if (v) return v;
      }
      return null;
    };

    const emailRaw = pick("contactemail", "contact_email");
    const contactEmailNormalized = emailRaw ? emailRaw.trim() : null;

    const fitRaw = pick("fitscore", "fit_score");
    let fitScore: number | null = null;
    if (fitRaw) {
      const n = Number.parseInt(fitRaw, 10);
      fitScore = Number.isFinite(n) ? n : null;
    }

    const rowTags = parseTags(get("tags"));
    rows.push({
      rowIndex: i + 1,
      name,
      leadType: lt,
      contactEmailNormalized,
      contactUrl: pick("contacturl", "contact_url"),
      websiteUrl: pick("websiteurl", "website_url", "website"),
      instagramUrl: pick("instagramurl", "instagram_url", "instagram"),
      youtubeUrl: pick("youtubeurl", "youtube_url", "youtube"),
      tiktokUrl: pick("tiktokurl", "tiktok_url", "tiktok"),
      city: pick("city") ?? defaults?.city?.trim() ?? null,
      suburb: pick("suburb") ?? defaults?.suburb?.trim() ?? null,
      region: pick("region") ?? defaults?.region?.trim() ?? null,
      discoveryMarketSlug:
        pick("discoverymarketslug", "discovery_market_slug", "market") ?? defaults?.discoveryMarketSlug?.trim() ?? null,
      source: pick("source") || defaults?.source?.trim() || "csv_import",
      fitScore,
      performanceTags: mergeTags(rowTags, defaults?.performanceTags),
      importKey: pick("importkey", "import_key"),
    });
  }

  return { rows, errors };
}

/** RFC-style CSV rows (quoted fields may contain commas). */
export function splitCsvIntoRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && (c === "\n" || c === "\r")) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    if (!inQuotes && c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const LEAD_UPLOAD_CSV_HEADERS = [
  "name",
  "leadType",
  "discoveryMarketSlug",
  "city",
  "suburb",
  "websiteUrl",
  "contactEmail",
  "additionalContactEmails",
  "contactUrl",
  "instagramUrl",
  "facebookUrl",
  "source",
  "sourceKind",
  "openMicSignalTier",
  "contactQuality",
  "fitScore",
  "internalNotes",
] as const;

/** Backward-compatible alias used by older imports/UI. */
export const CLAUDE_GROWTH_CSV_HEADERS = LEAD_UPLOAD_CSV_HEADERS;

export type ParsedClaudeGrowthLeadRow = {
  rowIndex: number;
  name: string;
  leadType: GrowthLeadType;
  discoveryMarketSlug: string | null;
  city: string | null;
  suburb: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  additionalContactEmails: string[];
  contactUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  source: string | null;
  sourceKind: GrowthLeadSourceKind;
  openMicSignalTier: GrowthLeadOpenMicSignalTier | null;
  contactQuality: GrowthLeadContactQuality | null;
  fitScore: number | null;
  internalNotes: string | null;
  importKey: string | null;
};

function parseGrowthLeadSourceKindCell(raw: string | undefined, fallback: GrowthLeadSourceKind): GrowthLeadSourceKind {
  const u = raw?.trim().toUpperCase().replace(/\s+/g, "_") ?? "";
  const map: Record<string, GrowthLeadSourceKind> = {
    MANUAL_ADMIN: "MANUAL_ADMIN",
    CSV_IMPORT: "CSV_IMPORT",
    CLAUDE_CSV: "CLAUDE_CSV",
    WEBSITE_CONTACT: "WEBSITE_CONTACT",
    SOCIAL_PROFILE: "SOCIAL_PROFILE",
    EVENT_LISTING: "EVENT_LISTING",
    SCHEDULED_JOB: "SCHEDULED_JOB",
  };
  return map[u] ?? fallback;
}

function parseOpenMicTier(raw: string | undefined): GrowthLeadOpenMicSignalTier | null {
  const u = raw?.trim().toUpperCase().replace(/\s+/g, "_") ?? "";
  if (u === "EXPLICIT_OPEN_MIC") return "EXPLICIT_OPEN_MIC";
  if (u === "STRONG_LIVE_EVENT") return "STRONG_LIVE_EVENT";
  if (u === "WEAK_INFERRED") return "WEAK_INFERRED";
  return null;
}

function parseContactQualityCell(raw: string | undefined): GrowthLeadContactQuality | null {
  const u = raw?.trim().toUpperCase().replace(/\s+/g, "_") ?? "";
  if (u === "EMAIL") return "EMAIL";
  if (u === "CONTACT_PAGE") return "CONTACT_PAGE";
  if (u === "SOCIAL_OR_CALENDAR") return "SOCIAL_OR_CALENDAR";
  if (u === "WEBSITE_ONLY") return "WEBSITE_ONLY";
  return null;
}

function splitAdditionalEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * Claude / LLM spreadsheet import: quoted CSV, exact column names (case-insensitive headers).
 */
export function parseClaudeGrowthLeadCsv(text: string): { rows: ParsedClaudeGrowthLeadRow[]; errors: string[] } {
  const errors: string[] = [];
  const table = splitCsvIntoRows(text);
  if (table.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."] };
  }

  const headers = table[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  const rows: ParsedClaudeGrowthLeadRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const get = (h: string) => {
      const j = idx(h);
      return j >= 0 ? cells[j]?.trim() : undefined;
    };

    const name = get("name")?.trim();
    if (!name) {
      errors.push(`Row ${r + 1}: missing name`);
      continue;
    }

    const lt = parseLeadType(get("leadtype"));
    if (!lt) {
      errors.push(`Row ${r + 1}: invalid leadType`);
      continue;
    }

    const fitRaw = get("fitscore");
    let fitScore: number | null = null;
    if (fitRaw) {
      const n = Number.parseInt(fitRaw, 10);
      fitScore = Number.isFinite(n) ? n : null;
    }

    const sourceKind = parseGrowthLeadSourceKindCell(get("sourcekind"), "CLAUDE_CSV");
    const slug = get("discoverymarketslug")?.trim() || null;

    rows.push({
      rowIndex: r + 1,
      name,
      leadType: lt,
      discoveryMarketSlug: slug,
      city: get("city")?.trim() || null,
      suburb: get("suburb")?.trim() || null,
      websiteUrl: get("websiteurl")?.trim() || null,
      contactEmail: get("contactemail")?.trim() || null,
      additionalContactEmails: splitAdditionalEmails(get("additionalcontactemails") ?? null),
      contactUrl: get("contacturl")?.trim() || null,
      instagramUrl: get("instagramurl")?.trim() || null,
      facebookUrl: get("facebookurl")?.trim() || null,
      source: get("source")?.trim() || "claude_csv",
      sourceKind,
      openMicSignalTier: parseOpenMicTier(get("openmicsignaltier")),
      contactQuality: parseContactQualityCell(get("contactquality")),
      fitScore,
      internalNotes: get("internalnotes")?.trim() || null,
      importKey: get("importkey")?.trim() || null,
    });
  }

  return { rows, errors };
}
