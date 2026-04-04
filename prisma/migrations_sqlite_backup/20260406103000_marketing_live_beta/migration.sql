-- Controlled live beta: contacts, sends, outreach approval, webhooks stub, event types

-- CreateEnum
CREATE TYPE "MarketingContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'REPLIED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "MarketingEmailCategory" AS ENUM ('TRANSACTIONAL', 'OUTREACH', 'MARKETING');

-- CreateEnum
CREATE TYPE "MarketingEmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingOutreachDraftStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'REJECTED');

-- AlterEnum
ALTER TYPE "MarketingEventType" ADD VALUE 'EMAIL_SENT';
ALTER TYPE "MarketingEventType" ADD VALUE 'EMAIL_BLOCKED';
ALTER TYPE "MarketingEventType" ADD VALUE 'EMAIL_FAILED';

-- AlterTable
ALTER TABLE "MarketingContact" ADD COLUMN "status" "MarketingContactStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "MarketingContact" ADD COLUMN "unsubscribeTokenHash" TEXT;
ALTER TABLE "MarketingContact" ADD COLUMN "repliedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MarketingContact_unsubscribeTokenHash_key" ON "MarketingContact"("unsubscribeTokenHash");

CREATE INDEX "MarketingContact_status_idx" ON "MarketingContact"("status");

UPDATE "MarketingContact" SET "status" = 'UNSUBSCRIBED' WHERE "marketingUnsubscribedAt" IS NOT NULL;
UPDATE "MarketingContact" SET "status" = 'BOUNCED' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'HARD_BOUNCE';
UPDATE "MarketingContact" SET "status" = 'COMPLAINED' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'COMPLAINT';
UPDATE "MarketingContact" SET "status" = 'DO_NOT_CONTACT' WHERE "suppressedAt" IS NOT NULL AND "suppressionReason" = 'ADMIN_SUPPRESS';

-- CreateTable
CREATE TABLE "MarketingEmailSend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- CreateTable
CREATE TABLE "MarketingOutreachDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- CreateTable
CREATE TABLE "MarketingProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MarketingProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingEmailSend_idempotencyKey_key" ON "MarketingEmailSend"("idempotencyKey");

CREATE INDEX "MarketingEmailSend_contactId_createdAt_idx" ON "MarketingEmailSend"("contactId", "createdAt");

CREATE INDEX "MarketingEmailSend_category_sentAt_idx" ON "MarketingEmailSend"("category", "sentAt");

CREATE INDEX "MarketingEmailSend_toDomain_sentAt_idx" ON "MarketingEmailSend"("toDomain", "sentAt");

CREATE INDEX "MarketingEmailSend_status_createdAt_idx" ON "MarketingEmailSend"("status", "createdAt");

CREATE INDEX "MarketingEmailSend_templateKind_idx" ON "MarketingEmailSend"("templateKind");

CREATE UNIQUE INDEX "MarketingOutreachDraft_marketingEmailSendId_key" ON "MarketingOutreachDraft"("marketingEmailSendId");

CREATE INDEX "MarketingOutreachDraft_venueId_status_idx" ON "MarketingOutreachDraft"("venueId", "status");

CREATE INDEX "MarketingOutreachDraft_status_createdAt_idx" ON "MarketingOutreachDraft"("status", "createdAt");

CREATE INDEX "MarketingProviderWebhookEvent_provider_createdAt_idx" ON "MarketingProviderWebhookEvent"("provider", "createdAt");

CREATE INDEX "MarketingProviderWebhookEvent_processedAt_idx" ON "MarketingProviderWebhookEvent"("processedAt");

ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_marketingEmailSendId_fkey" FOREIGN KEY ("marketingEmailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
