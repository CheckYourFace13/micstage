import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load env before reading DIRECT_URL / DATABASE_URL
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer DIRECT_URL (non-pooled) for migrate; fall back to DATABASE_URL (pooled URLs are common on Hostinger/Vercel).
    url: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
  },
});