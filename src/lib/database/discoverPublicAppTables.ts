/**
 * Discover ordinary public-schema tables for RLS security checks.
 * Excludes PostgreSQL system catalogs only — every app table must have RLS.
 */
export const PUBLIC_APP_TABLE_EXCLUSIONS: readonly { name: string; reason: string }[] = [
  { name: "_prisma_migrations", reason: "Prisma migration history — not application data" },
];

export type DiscoveredPublicTable = {
  name: string;
  rlsEnabled: boolean;
};

export function filterDiscoveredPublicAppTables(rows: Array<{ table_name: string; rls_enabled: boolean }>): DiscoveredPublicTable[] {
  const excluded = new Set(PUBLIC_APP_TABLE_EXCLUSIONS.map((e) => e.name));
  return rows
    .filter((r) => !excluded.has(r.table_name))
    .map((r) => ({ name: r.table_name, rlsEnabled: r.rls_enabled === true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Regression helper: proves the check fails when a new table lacks RLS. */
export function tablesMissingRls(tables: DiscoveredPublicTable[]): string[] {
  return tables.filter((t) => !t.rlsEnabled).map((t) => t.name);
}
