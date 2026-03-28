import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/lib/databaseUrl";

// Ensure Prisma CLI sees the same DB URL the app uses locally.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl() ?? undefined,
  },
});
