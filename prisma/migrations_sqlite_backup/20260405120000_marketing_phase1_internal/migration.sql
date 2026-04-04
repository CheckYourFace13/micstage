-- MicStage marketing automation phase 1 (internal infrastructure; no live sending)

-- CreateEnum
CREATE TYPE "MarketingEventType" AS ENUM ('INTERNAL_AUDIT', 'JOB_ENQUEUED', 'JOB_COMPLETED', 'JOB_FAILED', 'CONTACT_UPSERTED', 'SUPPRESSION_RECORDED', 'DRAFT_MATERIALIZED');

-- CreateEnum
CREATE TYPE "MarketingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingJobKind" AS ENUM ('VENUE_OUTREACH_DRAFT', 'EMAIL_PAYLOAD_RENDER', 'SOCIAL_PAYLOAD_RENDER', 'INDEXABILITY_SNAPSHOT');

-- CreateEnum
CREATE TYPE "MarketingSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'COMPLAINT', 'ADMIN_SUPPRESS');

-- CreateTable
CREATE TABLE "MarketingContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "venueId" TEXT,
    "discoveryMarketSlug" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "meta" JSONB,
    "marketingUnsubscribedAt" TIMESTAMP(3),
    "suppressedAt" TIMESTAMP(3),
    "suppressionReason" "MarketingSuppressionReason",

    CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- CreateTable
CREATE TABLE "MarketingEvent" (
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

-- CreateTable
CREATE TABLE "MarketingEmailSuppression" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailNormalized" TEXT NOT NULL,
    "reason" "MarketingSuppressionReason" NOT NULL,
    "sourceNote" TEXT,

    CONSTRAINT "MarketingEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContact_emailNormalized_key" ON "MarketingContact"("emailNormalized");

-- CreateIndex
CREATE INDEX "MarketingContact_discoveryMarketSlug_idx" ON "MarketingContact"("discoveryMarketSlug");

-- CreateIndex
CREATE INDEX "MarketingContact_suppressedAt_idx" ON "MarketingContact"("suppressedAt");

-- CreateIndex
CREATE INDEX "MarketingContact_marketingUnsubscribedAt_idx" ON "MarketingContact"("marketingUnsubscribedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingJob_idempotencyKey_key" ON "MarketingJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingJob_status_runAfter_idx" ON "MarketingJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "MarketingJob_kind_status_idx" ON "MarketingJob"("kind", "status");

-- CreateIndex
CREATE INDEX "MarketingJob_venueId_idx" ON "MarketingJob"("venueId");

-- CreateIndex
CREATE INDEX "MarketingEvent_createdAt_idx" ON "MarketingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_type_idx" ON "MarketingEvent"("type");

-- CreateIndex
CREATE INDEX "MarketingEvent_discoveryMarketSlug_idx" ON "MarketingEvent"("discoveryMarketSlug");

-- CreateIndex
CREATE INDEX "MarketingEvent_venueId_idx" ON "MarketingEvent"("venueId");

-- CreateIndex
CREATE INDEX "MarketingEvent_jobId_idx" ON "MarketingEvent"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailSuppression_emailNormalized_key" ON "MarketingEmailSuppression"("emailNormalized");

-- CreateIndex
CREATE INDEX "MarketingEmailSuppression_reason_idx" ON "MarketingEmailSuppression"("reason");

-- AddForeignKey
ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MarketingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
