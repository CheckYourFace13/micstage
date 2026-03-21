import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Returns a singleton Prisma client when DATABASE_URL is set; otherwise null.
 * Use on public pages so a missing or unreachable DB does not 500 the route.
 */
export function getPrismaOrNull(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  return globalForPrisma.prisma;
}

/** Server actions, auth, private routes — throws if DATABASE_URL is missing. */
export function requirePrisma(): PrismaClient {
  const p = getPrismaOrNull();
  if (!p) {
    throw new Error("DATABASE_URL is required for PostgreSQL.");
  }
  return p;
}
