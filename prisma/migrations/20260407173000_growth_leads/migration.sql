-- Growth lead pipeline: manual + CSV import; outreach drafts approval-required; follow-up table (automation off)

-- CreateEnum
CREATE TYPE "GrowthLeadType" AS ENUM ('VENUE', 'ARTIST', 'PROMOTER_ACCOUNT');

-- CreateEnum
CREATE TYPE "GrowthLeadStatus" AS ENUM ('DISCOVERED', 'REVIEWED', 'APPROVED', 'CONTACTED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GrowthLeadPerformanceTag" AS ENUM ('MUSIC', 'COMEDY', 'POETRY', 'VARIETY');

-- CreateEnum
CREATE TYPE "GrowthLeadOutreachDraftStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "GrowthLeadResponseChannel" AS ENUM ('EMAIL', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "GrowthLeadFollowUpStatus" AS ENUM ('PLANNED', 'CANCELLED', 'SKIPPED', 'COMPLETED');

-- CreateTable
CREATE TABLE "GrowthLead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadType" "GrowthLeadType" NOT NULL,
    "status" "GrowthLeadStatus" NOT NULL DEFAULT 'DISCOVERED',
    "name" TEXT NOT NULL,
    "contactEmailNormalized" TEXT,
    "contactUrl" TEXT,
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "youtubeUrl" TEXT,
    "tiktokUrl" TEXT,
    "city" TEXT,
    "region" TEXT,
    "discoveryMarketSlug" TEXT,
    "performanceTags" "GrowthLeadPerformanceTag"[] DEFAULT ARRAY[]::"GrowthLeadPerformanceTag"[],
    "source" TEXT,
    "fitScore" INTEGER,
    "importKey" TEXT,
    "internalNotes" TEXT,

    CONSTRAINT "GrowthLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthLeadOutreachDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT,
    "toEmailNormalized" TEXT NOT NULL,
    "status" "GrowthLeadOutreachDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
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

    CONSTRAINT "GrowthLeadOutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthLeadResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT NOT NULL,
    "channel" "GrowthLeadResponseChannel" NOT NULL DEFAULT 'NOTE',
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "actorEmail" TEXT,

    CONSTRAINT "GrowthLeadResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthLeadFollowUpSchedule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "runAfter" TIMESTAMP(3),
    "templateKey" TEXT,
    "status" "GrowthLeadFollowUpStatus" NOT NULL DEFAULT 'PLANNED',
    "lastError" TEXT,

    CONSTRAINT "GrowthLeadFollowUpSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthLead_importKey_key" ON "GrowthLead"("importKey");

CREATE INDEX "GrowthLead_leadType_status_idx" ON "GrowthLead"("leadType", "status");

CREATE INDEX "GrowthLead_discoveryMarketSlug_idx" ON "GrowthLead"("discoveryMarketSlug");

CREATE INDEX "GrowthLead_status_createdAt_idx" ON "GrowthLead"("status", "createdAt");

CREATE INDEX "GrowthLead_contactEmailNormalized_idx" ON "GrowthLead"("contactEmailNormalized");

CREATE UNIQUE INDEX "GrowthLeadOutreachDraft_marketingEmailSendId_key" ON "GrowthLeadOutreachDraft"("marketingEmailSendId");

CREATE INDEX "GrowthLeadOutreachDraft_leadId_status_idx" ON "GrowthLeadOutreachDraft"("leadId", "status");

CREATE INDEX "GrowthLeadOutreachDraft_status_createdAt_idx" ON "GrowthLeadOutreachDraft"("status", "createdAt");

CREATE INDEX "GrowthLeadResponse_leadId_createdAt_idx" ON "GrowthLeadResponse"("leadId", "createdAt");

CREATE INDEX "GrowthLeadFollowUpSchedule_enabled_runAfter_idx" ON "GrowthLeadFollowUpSchedule"("enabled", "runAfter");

CREATE INDEX "GrowthLeadFollowUpSchedule_leadId_idx" ON "GrowthLeadFollowUpSchedule"("leadId");

ALTER TABLE "GrowthLeadOutreachDraft" ADD CONSTRAINT "GrowthLeadOutreachDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "GrowthLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrowthLeadOutreachDraft" ADD CONSTRAINT "GrowthLeadOutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrowthLeadOutreachDraft" ADD CONSTRAINT "GrowthLeadOutreachDraft_marketingEmailSendId_fkey" FOREIGN KEY ("marketingEmailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrowthLeadResponse" ADD CONSTRAINT "GrowthLeadResponse_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "GrowthLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrowthLeadFollowUpSchedule" ADD CONSTRAINT "GrowthLeadFollowUpSchedule_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "GrowthLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
