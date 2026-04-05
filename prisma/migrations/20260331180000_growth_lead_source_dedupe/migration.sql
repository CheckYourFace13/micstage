CREATE TYPE "GrowthLeadSourceKind" AS ENUM (
  'MANUAL_ADMIN',
  'CSV_IMPORT',
  'WEBSITE_CONTACT',
  'SOCIAL_PROFILE',
  'EVENT_LISTING',
  'SCHEDULED_JOB'
);
-- AlterTable
ALTER TABLE "GrowthLead" ADD COLUMN "sourceKind" "GrowthLeadSourceKind" NOT NULL DEFAULT 'MANUAL_ADMIN';
ALTER TABLE "GrowthLead" ADD COLUMN "discoveryConfidence" INTEGER;
ALTER TABLE "GrowthLead" ADD COLUMN "websiteHostNormalized" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN "instagramHandleNormalized" TEXT;
-- CreateIndex
CREATE INDEX "GrowthLead_websiteHostNormalized_leadType_idx" ON "GrowthLead"("websiteHostNormalized", "leadType");
CREATE INDEX "GrowthLead_instagramHandleNormalized_leadType_idx" ON "GrowthLead"("instagramHandleNormalized", "leadType");
-- Backfill sourceKind from legacy `source` string
UPDATE "GrowthLead" SET "sourceKind" = 'CSV_IMPORT' WHERE "source" IS NOT NULL AND "source" ILIKE 'csv%';
UPDATE "GrowthLead" SET "sourceKind" = 'MANUAL_ADMIN' WHERE "source" IS NOT NULL AND ("source" = 'manual' OR "source" ILIKE 'manual%');