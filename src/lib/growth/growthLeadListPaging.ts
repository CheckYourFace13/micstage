export const GROWTH_LEADS_PAGE_SIZE_DEFAULT = 50;
/** Admin UI + CSV export batching — generous cap; still bounded for memory safety. */
export const GROWTH_LEADS_PAGE_SIZE_MAX = 500;

export function clampGrowthLeadPageSize(n: number | undefined): number {
  const raw = n == null || !Number.isFinite(n) ? GROWTH_LEADS_PAGE_SIZE_DEFAULT : Math.floor(n);
  return Math.min(GROWTH_LEADS_PAGE_SIZE_MAX, Math.max(10, raw));
}

export function parseGrowthLeadsPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function parseGrowthLeadsPageSizeParam(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return GROWTH_LEADS_PAGE_SIZE_DEFAULT;
  return clampGrowthLeadPageSize(n);
}
