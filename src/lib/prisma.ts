import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { logDbDebug } from "./dbDebugLog";
import { resolveDatabaseUrl } from "./databaseUrl";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Returns a singleton Prisma client when a Postgres URL is set (see `resolveDatabaseUrl`); otherwise null.
 * Use on public pages so a missing or unreachable DB does not 500 the route.
 *
 * Prisma 7 + `@prisma/adapter-pg` does not accept `datasources` on the client constructor (runtime rejects unknown keys).
 * The same `dbUrl` is passed to the adapter as `connectionString`, which is how the client reaches Postgres.
 */
export function getPrismaOrNull(): PrismaClient | null {
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    logDbDebug("NO DATABASE URL FOUND");
    return null;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
    });
  }
  return globalForPrisma.prisma;
}

/** Server actions, auth, private routes — throws if no database URL is configured. */
export function requirePrisma(): PrismaClient {
  const p = getPrismaOrNull();
  if (!p) {
    throw new Error("DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) is required for PostgreSQL.");
  }
  return p;
}
