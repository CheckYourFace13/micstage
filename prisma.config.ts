import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load env before reading DIRECT_URL (Prisma CLI only; app runtime uses DATABASE_URL via src/lib/prisma.ts).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Prisma CLI (`migrate`, `db pull`, etc.) should use a direct database connection.
 * Supabase: point DIRECT_URL at the direct Postgres URL (e.g. port 5432); keep DATABASE_URL as the
 * pooler URL for the app. For local dev without a pooler, you can set DIRECT_URL equal to DATABASE_URL.
 *
 * @see https://www.prisma.io/docs/orm/overview/databases/supabase
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL?.trim(),
  },
});
