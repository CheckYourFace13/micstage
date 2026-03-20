import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Ensure Prisma CLI sees the same DATABASE_URL the app uses locally.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
