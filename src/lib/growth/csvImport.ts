import type { GrowthLeadPerformanceTag, GrowthLeadType } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

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
    const contactEmailNormalized = emailRaw ? normalizeMarketingEmail(emailRaw) : null;

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
