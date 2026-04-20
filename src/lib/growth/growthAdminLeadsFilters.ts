import type {
  GrowthLeadAcquisitionStage,
  GrowthLeadContactQuality,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  GrowthLeadSourceKind,
  GrowthLeadStatus,
  GrowthLeadType,
} from "@/generated/prisma/client";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import type { GrowthLeadListFilters, GrowthLeadOutreachQueue } from "@/lib/growth/growthLeadFilters";
import { GROWTH_LEAD_STATUS_SET } from "@/lib/growth/growthLeadStatusSet";
import { resolveAdminGrowthLeadsMarketSlug } from "@/lib/growth/marketsConfig";
import {
  GROWTH_LEADS_PAGE_SIZE_DEFAULT,
  parseGrowthLeadsPageSizeParam,
} from "@/lib/growth/growthLeadListPaging";

export function parseLeadTypeParam(raw: string | undefined): GrowthLeadType | null {
  if (!raw?.trim()) return null;
  const u = raw.trim().toUpperCase();
  if (u === "VENUE" || u === "ARTIST" || u === "PROMOTER_ACCOUNT") return u;
  return null;
}

export function parseTagsParam(raw: string | undefined): GrowthLeadPerformanceTag[] {
  const out: GrowthLeadPerformanceTag[] = [];
  for (const part of (raw ?? "").split(",")) {
    const u = part.trim().toUpperCase();
    if (u === "MUSIC") out.push("MUSIC");
    if (u === "COMEDY") out.push("COMEDY");
    if (u === "POETRY") out.push("POETRY");
    if (u === "VARIETY") out.push("VARIETY");
  }
  return [...new Set(out)];
}

export function parseStatusesParam(raw: string | undefined): GrowthLeadStatus[] | null {
  if (!raw?.trim()) return null;
  const out: GrowthLeadStatus[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim() as GrowthLeadStatus;
    if (GROWTH_LEAD_STATUS_SET.has(t)) out.push(t);
  }
  return out.length ? out : null;
}

export function parseIntOpt(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseOpenMicTierParam(raw: string | undefined): GrowthLeadOpenMicSignalTier | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  if (u === "EXPLICIT_OPEN_MIC" || u === "STRONG_LIVE_EVENT" || u === "WEAK_INFERRED") return u;
  return null;
}

export function parseContactQualityParam(raw: string | undefined): GrowthLeadContactQuality | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  if (u === "EMAIL" || u === "CONTACT_PAGE" || u === "SOCIAL_OR_CALENDAR" || u === "WEBSITE_ONLY") return u;
  return null;
}

export function parseAcquisitionStageParam(raw: string | undefined): GrowthLeadAcquisitionStage | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  const allowed: GrowthLeadAcquisitionStage[] = [
    "DISCOVERED",
    "OUTREACH_DRAFTED",
    "OUTREACH_SENT",
    "CLICKED",
    "SIGNUP_STARTED",
    "ACCOUNT_CREATED",
    "LISTING_LIVE",
  ];
  return allowed.includes(u as GrowthLeadAcquisitionStage) ? (u as GrowthLeadAcquisitionStage) : null;
}

export function parseOutreachQueueParam(raw: string | undefined): GrowthLeadOutreachQueue {
  if (!raw?.trim()) return "all";
  const u = raw.trim();
  const allowed: GrowthLeadOutreachQueue[] = [
    "all",
    "email_pipeline",
    "email_outreach_ready",
    "usable_email_backlog",
    "valid_high_medium_email",
    "blocked_low_confidence_email",
    "blocked_invalid_email",
    "no_primary_email",
    "contact_path_queue",
    "social_path_queue",
    "website_only_queue",
  ];
  return allowed.includes(u as GrowthLeadOutreachQueue) ? (u as GrowthLeadOutreachQueue) : "all";
}

const GROWTH_LEAD_SOURCE_KIND_SET = new Set<string>([
  "MANUAL_ADMIN",
  "CSV_IMPORT",
  "CLAUDE_CSV",
  "WEBSITE_CONTACT",
  "SOCIAL_PROFILE",
  "EVENT_LISTING",
  "SCHEDULED_JOB",
]);

/** Comma-separated `GrowthLeadSourceKind` values (e.g. `CSV_IMPORT,CLAUDE_CSV`). */
export function parseSourceKindsParam(raw: string | undefined): GrowthLeadSourceKind[] | null {
  if (!raw?.trim()) return null;
  const out: GrowthLeadSourceKind[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (GROWTH_LEAD_SOURCE_KIND_SET.has(t)) out.push(t as GrowthLeadSourceKind);
  }
  return out.length ? out : null;
}

export type AdminGrowthLeadsSearchParams = {
  market?: string;
  metro?: string;
  type?: string;
  city?: string;
  suburb?: string;
  tags?: string;
  status?: string;
  fitMin?: string;
  fitMax?: string;
  q?: string;
  pipeline?: string;
  draftPending?: string;
  omTier?: string;
  contactQ?: string;
  acquisition?: string;
  queue?: string;
  /** Comma-separated source kinds (upload vs discovery paths). */
  sourceKind?: string;
  page?: string;
  perPage?: string;
};

/** Parse admin growth-leads query keys from a request URL (export route, etc.). */
export function adminGrowthLeadsSearchParamsFromUrl(sp: URLSearchParams): AdminGrowthLeadsSearchParams {
  const g = (k: keyof AdminGrowthLeadsSearchParams): string | undefined => {
    const v = sp.get(k);
    return v != null && v !== "" ? v : undefined;
  };
  return {
    market: g("market"),
    metro: g("metro"),
    type: g("type"),
    city: g("city"),
    suburb: g("suburb"),
    tags: g("tags"),
    status: g("status"),
    fitMin: g("fitMin"),
    fitMax: g("fitMax"),
    q: g("q"),
    pipeline: g("pipeline"),
    draftPending: g("draftPending"),
    omTier: g("omTier"),
    contactQ: g("contactQ"),
    acquisition: g("acquisition"),
    queue: g("queue"),
    sourceKind: g("sourceKind"),
    page: g("page"),
    perPage: g("perPage"),
  };
}

export function growthLeadFiltersFromAdminSearchParams(p: AdminGrowthLeadsSearchParams): {
  marketSlug: string | null;
  filters: GrowthLeadListFilters;
} {
  const marketSlug = resolveAdminGrowthLeadsMarketSlug({ market: p.market, metro: p.metro });
  const outreachQueue = parseOutreachQueueParam(p.queue);
  const filters: GrowthLeadListFilters = {
    marketSlug,
    leadType: parseLeadTypeParam(p.type),
    cityContains: p.city,
    suburbContains: p.suburb,
    tagsAny: parseTagsParam(p.tags),
    statuses: parseStatusesParam(p.status),
    fitMin: parseIntOpt(p.fitMin),
    fitMax: parseIntOpt(p.fitMax),
    nameContains: p.q,
    pipelineOnly: p.pipeline === "1",
    draftPending: p.draftPending === "1",
    openMicSignalTier: parseOpenMicTierParam(p.omTier),
    contactQuality: parseContactQualityParam(p.contactQ),
    acquisitionStage: parseAcquisitionStageParam(p.acquisition),
    outreachQueue,
    sourceKinds: parseSourceKindsParam(p.sourceKind),
  };
  return { marketSlug, filters };
}

export function buildGrowthLeadsPaginationBaseQuery(p: {
  market?: string;
  type?: string;
  city?: string;
  suburb?: string;
  tags?: string;
  status?: string;
  fitMin?: string;
  fitMax?: string;
  q?: string;
  pipeline?: string;
  draftPending?: string;
  omTier?: string;
  contactQ?: string;
  acquisition?: string;
  queue?: string;
  sourceKind?: string;
  perPage?: string;
}): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  const set = (k: string, v: string | undefined) => {
    if (v != null && v !== "") o[k] = v;
  };
  set("market", p.market?.trim());
  set("type", p.type?.trim());
  set("city", p.city?.trim());
  set("suburb", p.suburb?.trim());
  set("tags", p.tags?.trim());
  set("status", p.status?.trim());
  set("fitMin", p.fitMin?.trim());
  set("fitMax", p.fitMax?.trim());
  set("q", p.q?.trim());
  set("omTier", p.omTier?.trim());
  set("contactQ", p.contactQ?.trim());
  set("acquisition", p.acquisition?.trim());
  if (p.pipeline === "1") o.pipeline = "1";
  if (p.draftPending === "1") o.draftPending = "1";
  const queue = parseOutreachQueueParam(p.queue);
  if (queue !== "all") o.queue = queue;
  set("sourceKind", p.sourceKind?.trim());
  const ps = parseGrowthLeadsPageSizeParam(p.perPage);
  if (ps !== GROWTH_LEADS_PAGE_SIZE_DEFAULT) o.perPage = String(ps);
  return o;
}

/** Same where clause as the admin leads table (for counts + exports). */
export function adminGrowthLeadsWhereFromSearchParams(p: AdminGrowthLeadsSearchParams) {
  const { filters } = growthLeadFiltersFromAdminSearchParams(p);
  return buildGrowthLeadWhere(filters);
}
