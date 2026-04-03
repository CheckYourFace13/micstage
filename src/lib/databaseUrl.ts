import { logDbDebug } from "./dbDebugLog";

/**
 * Postgres connection string for Prisma (runtime + CLI).
 * Hosts may expose POSTGRES_URL / POSTGRES_PRISMA_URL while docs say DATABASE_URL.
 */
export function resolveDatabaseUrl(): string | null {
  let url: string | null = null;
  for (const key of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "PRISMA_DATABASE_URL",
  ] as const) {
    const v = process.env[key]?.trim();
    if (v) {
      url = v;
      break;
    }
  }
  logDbDebug("DB URL FOUND:", !!url);
  return url;
}
