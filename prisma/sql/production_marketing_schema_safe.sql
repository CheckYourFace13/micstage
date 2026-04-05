-- MicStage: marketing-only DDL for production Postgres (safe / no Slot changes)
--
-- Source of truth: prisma/schema.prisma + prisma/migrations/20260331140000_postgres_baseline
-- (aligned with backups: 20260405120000_marketing_phase1_internal, 20260406103000_marketing_live_beta)
--
-- PostgreSQL: 11+ required (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`). Prefer 12+ if you wrap
-- this entire file in a single transaction (`ALTER TYPE ... ADD VALUE` limitations in older versions).
--
-- Prerequisites:
--   - Database is PostgreSQL (Hostinger-managed is fine).
--   - Table "Venue" already exists with primary key on "id" (FK targets).
--   - Run as a user with CREATE on the schema (usually public).
--
-- Where to run:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/production_marketing_schema_safe.sql
--   Or: Hostinger phpPgAdmin / DBeaver / TablePlus → paste and execute.
--
-- Idempotency:
--   - Enums: created only if missing; extra MarketingEventType labels use ADD VALUE IF NOT EXISTS.
--   - Tables: CREATE IF NOT EXISTS; extra columns added via DO blocks (ignore duplicate_column).
--   - Indexes: IF NOT EXISTS.
--   - FKs: DO blocks ignore duplicate_object.
--   - UPDATE backfills are safe to re-run (same predicates).
--
-- Does NOT modify Slot, bookingRestrictionModeOverride, or any non-marketing tables.
--
-- Recommended: run inside a transaction and COMMIT after review:
--   BEGIN;
--   \i prisma/sql/production_marketing_schema_safe.sql
--   COMMIT;

-- ---------------------------------------------------------------------------
-- 1) ENUM types
-- ---------------------------------------------------------------------------

DO $t$
BEGIN
  IF to_regtype('public."MarketingEventType"') IS NULL THEN
    CREATE TYPE "MarketingEventType" AS ENUM (
      'INTERNAL_AUDIT', 'JOB_ENQUEUED', 'JOB_COMPLETED', 'JOB_FAILED',
      'CONTACT_UPSERTED', 'SUPPRESSION_RECORDED', 'DRAFT_MATERIALIZED',
      'EMAIL_SENT', 'EMAIL_BLOCKED', 'EMAIL_FAILED'
    );
  END IF;
END
$t$;

-- Phase-1 DBs may already have MarketingEventType without the three email labels.
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_SENT';
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_BLOCKED';
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_FAILED';

DO $t$
BEGIN
  IF to_regtype('public."MarketingJobStatus"') IS NULL THEN
    CREATE TYPE "MarketingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingJobKind"') IS NULL THEN
    CREATE TYPE "MarketingJobKind" AS ENUM ('VENUE_OUTREACH_DRAFT', 'EMAIL_PAYLOAD_RENDER', 'SOCIAL_PAYLOAD_RENDER', 'INDEXABILITY_SNAPSHOT');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingSuppressionReason"') IS NULL THEN
    CREATE TYPE "MarketingSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'COMPLAINT', 'ADMIN_SUPPRESS');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingContactStatus"') IS NULL THEN
    CREATE TYPE "MarketingContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'REPLIED', 'DO_NOT_CONTACT');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingEmailCategory"') IS NULL THEN
    CREATE TYPE "MarketingEmailCategory" AS ENUM ('TRANSACTIONAL', 'OUTREACH', 'MARKETING');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingEmailSendStatus"') IS NULL THEN
    CREATE TYPE "MarketingEmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'BLOCKED', 'FAILED');
  END IF;
END $t$;

DO $t$
BEGIN
  IF to_regtype('public."MarketingOutreachDraftStatus"') IS NULL THEN
    CREATE TYPE "MarketingOutreachDraftStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'REJECTED');
  END IF;
END $t$;

-- ---------------------------------------------------------------------------
-- 2) Tables (full definition when missing)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "MarketingContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "venueId" TEXT,
    "discoveryMarketSlug" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "meta" JSONB,
    "status" "MarketingContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "unsubscribeTokenHash" TEXT,
    "repliedAt" TIMESTAMP(3),
    "marketingUnsubscribedAt" TIMESTAMP(3),
    "suppressedAt" TIMESTAMP(3),
    "suppressionReason" "MarketingSuppressionReason",
    CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "MarketingJobStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "MarketingJobKind" NOT NULL,
    "runAfter" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "idempotencyKey" TEXT,
    "discoveryMarketSlug" TEXT,
    "venueId" TEXT,
    "contactId" TEXT,
    "payload" JSONB,
    "lastError" TEXT,
    CONSTRAINT "MarketingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "MarketingEventType" NOT NULL,
    "discoveryMarketSlug" TEXT,
    "actorEmail" TEXT,
    "venueId" TEXT,
    "contactId" TEXT,
    "jobId" TEXT,
    "payload" JSONB,
    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingEmailSuppression" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailNormalized" TEXT NOT NULL,
    "reason" "MarketingSuppressionReason" NOT NULL,
    "sourceNote" TEXT,
    CONSTRAINT "MarketingEmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingEmailSend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactId" TEXT,
    "toEmailNormalized" TEXT NOT NULL,
    "toDomain" TEXT NOT NULL,
    "category" "MarketingEmailCategory" NOT NULL,
    "templateKind" TEXT NOT NULL,
    "purposeKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MarketingEmailSendStatus" NOT NULL DEFAULT 'QUEUED',
    "blockedReason" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "venueId" TEXT,
    "discoveryMarketSlug" TEXT,
    CONSTRAINT "MarketingEmailSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingOutreachDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "contactId" TEXT,
    "toEmailNormalized" TEXT NOT NULL,
    "status" "MarketingOutreachDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "discoveryMarketSlug" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByEmail" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "marketingEmailSendId" TEXT,
    CONSTRAINT "MarketingOutreachDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "MarketingProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3) Upgrade path: phase-1 "MarketingContact" without live-beta columns
-- ---------------------------------------------------------------------------

DO $c$ BEGIN
  ALTER TABLE "MarketingContact" ADD COLUMN "status" "MarketingContactStatus" NOT NULL DEFAULT 'ACTIVE';
EXCEPTION WHEN duplicate_column THEN NULL; END $c$;

DO $c$ BEGIN
  ALTER TABLE "MarketingContact" ADD COLUMN "unsubscribeTokenHash" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $c$;

DO $c$ BEGIN
  ALTER TABLE "MarketingContact" ADD COLUMN "repliedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $c$;

-- Backfill status from legacy flags (same predicates as 20260406103000_marketing_live_beta)
UPDATE "MarketingContact" SET "status" = 'UNSUBSCRIBED' WHERE "marketingUnsubscribedAt" IS NOT NULL;
UPDATE "MarketingContact" SET "status" = 'BOUNCED' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'HARD_BOUNCE';
UPDATE "MarketingContact" SET "status" = 'COMPLAINED' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'COMPLAINT';
UPDATE "MarketingContact" SET "status" = 'DO_NOT_CONTACT' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'ADMIN_SUPPRESS';

-- ---------------------------------------------------------------------------
-- 4) Indexes (match Prisma / baseline)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingContact_emailNormalized_key" ON "MarketingContact"("emailNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingContact_unsubscribeTokenHash_key" ON "MarketingContact"("unsubscribeTokenHash");
CREATE INDEX IF NOT EXISTS "MarketingContact_discoveryMarketSlug_idx" ON "MarketingContact"("discoveryMarketSlug");
CREATE INDEX IF NOT EXISTS "MarketingContact_suppressedAt_idx" ON "MarketingContact"("suppressedAt");
CREATE INDEX IF NOT EXISTS "MarketingContact_marketingUnsubscribedAt_idx" ON "MarketingContact"("marketingUnsubscribedAt");
CREATE INDEX IF NOT EXISTS "MarketingContact_status_idx" ON "MarketingContact"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingJob_idempotencyKey_key" ON "MarketingJob"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "MarketingJob_status_runAfter_idx" ON "MarketingJob"("status", "runAfter");
CREATE INDEX IF NOT EXISTS "MarketingJob_kind_status_idx" ON "MarketingJob"("kind", "status");
CREATE INDEX IF NOT EXISTS "MarketingJob_venueId_idx" ON "MarketingJob"("venueId");

CREATE INDEX IF NOT EXISTS "MarketingEvent_createdAt_idx" ON "MarketingEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "MarketingEvent_type_idx" ON "MarketingEvent"("type");
CREATE INDEX IF NOT EXISTS "MarketingEvent_discoveryMarketSlug_idx" ON "MarketingEvent"("discoveryMarketSlug");
CREATE INDEX IF NOT EXISTS "MarketingEvent_venueId_idx" ON "MarketingEvent"("venueId");
CREATE INDEX IF NOT EXISTS "MarketingEvent_jobId_idx" ON "MarketingEvent"("jobId");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingEmailSuppression_emailNormalized_key" ON "MarketingEmailSuppression"("emailNormalized");
CREATE INDEX IF NOT EXISTS "MarketingEmailSuppression_reason_idx" ON "MarketingEmailSuppression"("reason");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingEmailSend_idempotencyKey_key" ON "MarketingEmailSend"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "MarketingEmailSend_contactId_createdAt_idx" ON "MarketingEmailSend"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketingEmailSend_category_sentAt_idx" ON "MarketingEmailSend"("category", "sentAt");
CREATE INDEX IF NOT EXISTS "MarketingEmailSend_toDomain_sentAt_idx" ON "MarketingEmailSend"("toDomain", "sentAt");
CREATE INDEX IF NOT EXISTS "MarketingEmailSend_status_createdAt_idx" ON "MarketingEmailSend"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketingEmailSend_templateKind_idx" ON "MarketingEmailSend"("templateKind");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingOutreachDraft_marketingEmailSendId_key" ON "MarketingOutreachDraft"("marketingEmailSendId");
CREATE INDEX IF NOT EXISTS "MarketingOutreachDraft_venueId_status_idx" ON "MarketingOutreachDraft"("venueId", "status");
CREATE INDEX IF NOT EXISTS "MarketingOutreachDraft_status_createdAt_idx" ON "MarketingOutreachDraft"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "MarketingProviderWebhookEvent_provider_createdAt_idx" ON "MarketingProviderWebhookEvent"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketingProviderWebhookEvent_processedAt_idx" ON "MarketingProviderWebhookEvent"("processedAt");

-- ---------------------------------------------------------------------------
-- 5) Foreign keys (Venue / self-references only)
-- ---------------------------------------------------------------------------

DO $f$ BEGIN
  ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MarketingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

DO $f$ BEGIN
  ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_marketingEmailSendId_fkey" FOREIGN KEY ("marketingEmailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $f$;

-- Done.
