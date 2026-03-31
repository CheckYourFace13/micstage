import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "**/.next/**",
    "out/**",
    "**/out/**",
    "build/**",
    "**/build/**",
    "dist/**",
    "**/dist/**",
    "coverage/**",
    "**/coverage/**",
    "next-env.d.ts",
    "src/generated/**",
    "**/src/generated/**",
    "prisma/generated/**",
    "**/prisma/generated/**",
    "node_modules/.prisma/**",
    "**/node_modules/.prisma/**",
  ]),
]);

export default eslintConfig;

