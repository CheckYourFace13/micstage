#!/usr/bin/env node
/**
 * Validates environment before production deploy.
 * Loads .env.local then .env (does not override existing OS env).
 *
 *   node scripts/check-production-env.mjs
 *   node scripts/check-production-env.mjs --production
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(name) {
  const p = join(process.cwd(), name);
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const production = process.argv.includes("--production");

function fail(msg) {
  console.error("[check-production-env] FAIL:", msg);
  process.exit(1);
}

function warn(msg) {
  console.warn("[check-production-env] WARN:", msg);
}

function ok(msg) {
  console.log("[check-production-env] OK:", msg);
}

const auth = process.env.AUTH_SECRET;
if (!auth || typeof auth !== "string" || auth.length < 32) {
  fail("AUTH_SECRET must be set and at least 32 characters.");
}
ok("AUTH_SECRET length");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
  if (production) {
    fail("Set APP_URL and NEXT_PUBLIC_APP_URL for production, e.g. https://micstage.com");
  }
  warn("APP_URL not set — fine for local dev; set it before deploy (and run with --production to verify).");
} else if (!appUrl.startsWith("https://")) {
  if (production) {
    warn("APP_URL should use https in production (got: " + appUrl + ")");
  } else {
    warn("APP_URL is not https — OK for localhost; use https for production.");
  }
} else {
  ok("APP_URL uses https");
}

if (production) {
  if (!process.env.RESEND_API_KEY) {
    fail("RESEND_API_KEY is required in production.");
  }
  ok("RESEND_API_KEY is set");

  if (!process.env.EMAIL_FROM) {
    fail("EMAIL_FROM is required in production (verified domain in Resend).");
  }
  ok("EMAIL_FROM is set");

  if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY?.trim()) {
    warn(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY not set — set a stable secret in production so server actions stay valid across deploys; users may need a hard refresh after deploy until this is set.",
    );
  } else {
    ok("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is set");
  }

  if (!process.env.EMAIL_FROM_TRANSACTIONAL?.trim()) {
    warn(
      "EMAIL_FROM_TRANSACTIONAL not set — transactional mail falls back to EMAIL_FROM (OK if same identity).",
    );
  }
  if (!process.env.EMAIL_FROM_OUTREACH?.trim() && !process.env.EMAIL_FROM_MARKETING?.trim()) {
    warn(
      "EMAIL_FROM_OUTREACH / EMAIL_FROM_MARKETING not set — outreach and marketing use EMAIL_FROM (weaker deliverability separation).",
    );
  }
  if (!process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim()) {
    warn("MARKETING_UNSUBSCRIBE_SECRET not set — unsubscribe signing falls back to AUTH_SECRET.");
  }
  if (!process.env.MARKETING_PHYSICAL_ADDRESS?.trim() && !process.env.EMAIL_PHYSICAL_ADDRESS?.trim()) {
    warn("MARKETING_PHYSICAL_ADDRESS not set — commercial footers use placeholder text until set.");
  }

  const contactInbox =
    process.env.MICSTAGE_CONTACT_INBOX?.trim() ||
    process.env.CONTACT_INBOX?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    "";
  if (!contactInbox) {
    fail(
      "Set MICSTAGE_CONTACT_INBOX (or CONTACT_INBOX / NEXT_PUBLIC_CONTACT_EMAIL) so the /contact form can deliver messages.",
    );
  }
  ok("Contact inbox (MICSTAGE_CONTACT_INBOX or equivalent) is set");

  const db =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.PRISMA_DATABASE_URL?.trim() ||
    "";
  if (db.startsWith("file:")) {
    warn(
      "DATABASE_URL is SQLite. For real traffic use Postgres; schema is still sqlite-only until you migrate (see docs).",
    );
  } else if (/^postgres(ql)?:\/\//i.test(db)) {
    ok("DATABASE_URL looks like Postgres");
  } else if (!db) {
    fail("DATABASE_URL is not set.");
  } else {
    warn("DATABASE_URL format not recognized.");
  }
} else {
  console.log("[check-production-env] Run with --production before final deploy for strict checks.");
}

console.log("[check-production-env] Done.");
