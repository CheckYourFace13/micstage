-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VenueRole" AS ENUM ('ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VenuePerformanceFormat" AS ENUM ('OPEN_VARIETY', 'ACOUSTIC_ONLY', 'GUITAR_VOCAL_ONLY', 'FULL_BANDS_ALLOWED', 'COMEDY_SPOKEN_WORD', 'COMEDY', 'SPOKEN_WORD');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "BookingRestrictionMode" AS ENUM ('NONE', 'ATTENDEE_DAY_OF', 'HOURS_BEFORE', 'ON_PREMISE', 'HOUSE_ONLY');

-- CreateEnum
CREATE TYPE "PasswordResetAccountType" AS ENUM ('VENUE', 'MUSICIAN');

-- CreateEnum
CREATE TYPE "VenuePerformerHistoryKind" AS ENUM ('MUSICIAN', 'MANUAL');

-- CreateEnum
CREATE TYPE "MarketingEventType" AS ENUM ('INTERNAL_AUDIT', 'JOB_ENQUEUED', 'JOB_COMPLETED', 'JOB_FAILED', 'CONTACT_UPSERTED', 'SUPPRESSION_RECORDED', 'DRAFT_MATERIALIZED', 'EMAIL_SENT', 'EMAIL_BLOCKED', 'EMAIL_FAILED');

-- CreateEnum
CREATE TYPE "MarketingContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'REPLIED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "MarketingEmailCategory" AS ENUM ('TRANSACTIONAL', 'OUTREACH', 'MARKETING');

-- CreateEnum
CREATE TYPE "MarketingEmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingOutreachDraftStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingJobKind" AS ENUM ('VENUE_OUTREACH_DRAFT', 'EMAIL_PAYLOAD_RENDER', 'SOCIAL_PAYLOAD_RENDER', 'INDEXABILITY_SNAPSHOT');

-- CreateEnum
CREATE TYPE "MarketingSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'COMPLAINT', 'ADMIN_SUPPRESS');

-- CreateTable
CREATE TABLE "VenueOwner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "VenueOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "about" TEXT,
    "logoUrl" TEXT,
    "imagePrimaryUrl" TEXT,
    "imageSecondaryUrl" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "twitterUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "soundcloudUrl" TEXT,
    "seriesStartDate" TIMESTAMP(3),
    "seriesEndDate" TIMESTAMP(3),
    "bookingOpensDaysAhead" INTEGER NOT NULL DEFAULT 60,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "bookingRestrictionMode" "BookingRestrictionMode" NOT NULL DEFAULT 'NONE',
    "restrictionHoursBefore" INTEGER NOT NULL DEFAULT 6,
    "onPremiseMaxDistanceMeters" INTEGER NOT NULL DEFAULT 1000,
    "performanceFormat" "VenuePerformanceFormat" NOT NULL DEFAULT 'OPEN_VARIETY',
    "providesPA" BOOLEAN NOT NULL DEFAULT false,
    "providesSpeakersMics" BOOLEAN NOT NULL DEFAULT false,
    "providesMonitors" BOOLEAN NOT NULL DEFAULT false,
    "providesDrumKit" BOOLEAN NOT NULL DEFAULT false,
    "providesBassAmp" BOOLEAN NOT NULL DEFAULT false,
    "providesGuitarAmp" BOOLEAN NOT NULL DEFAULT false,
    "providesKeyboard" BOOLEAN NOT NULL DEFAULT false,
    "providesDiBox" BOOLEAN NOT NULL DEFAULT false,
    "providesLightingBasic" BOOLEAN NOT NULL DEFAULT false,
    "providesBacklineShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueManager" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "VenueManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueManagerAccess" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venueId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "role" "VenueRole" NOT NULL DEFAULT 'MANAGER',

    CONSTRAINT "VenueManagerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicianUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "bio" TEXT,
    "websiteUrl" TEXT,
    "imageUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "twitterUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "soundcloudUrl" TEXT,
    "specializations" JSONB,
    "instruments" JSONB,
    "yearsPlaying" INTEGER,
    "openToHire" BOOLEAN NOT NULL DEFAULT false,
    "hireRateDescription" TEXT,
    "setLengthMinutes" INTEGER,
    "collaborationsText" TEXT,
    "homeGooglePlaceId" TEXT,
    "homeFormattedAddress" TEXT,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "homeCity" TEXT,
    "homeRegion" TEXT,
    "travelRadiusMiles" INTEGER,
    "secondaryGooglePlaceId" TEXT,
    "secondaryFormattedAddress" TEXT,
    "secondaryLat" DOUBLE PRECISION,
    "secondaryLng" DOUBLE PRECISION,
    "secondaryCity" TEXT,
    "secondaryRegion" TEXT,
    "secondaryRadiusMiles" INTEGER,

    CONSTRAINT "MusicianUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenuePerformerHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "VenuePerformerHistoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "musicianId" TEXT,
    "displayName" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "showOnPublicProfile" BOOLEAN NOT NULL DEFAULT true,
    "linkedMusicianId" TEXT,

    CONSTRAINT "VenuePerformerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicianPastVenue" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "musicianId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,

    CONSTRAINT "MusicianPastVenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicianVenueInterest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "musicianId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,

    CONSTRAINT "MusicianVenueInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weekday" "Weekday" NOT NULL,
    "startTimeMin" INTEGER NOT NULL,
    "endTimeMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "slotMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "performanceFormat" "VenuePerformanceFormat" NOT NULL DEFAULT 'OPEN_VARIETY',
    "bookingRestrictionMode" "BookingRestrictionMode" NOT NULL DEFAULT 'NONE',
    "restrictionHoursBefore" INTEGER NOT NULL DEFAULT 6,
    "onPremiseMaxDistanceMeters" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInstance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTimeMinOverride" INTEGER,
    "endTimeMinOverride" INTEGER,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "instanceId" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "manualLineupLabel" TEXT,
    "bookingRestrictionModeOverride" "BookingRestrictionMode",
    "restrictionHoursBeforeOverride" INTEGER,
    "onPremiseMaxDistanceMetersOverride" INTEGER,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slotId" TEXT NOT NULL,
    "musicianId" TEXT,
    "performerName" TEXT NOT NULL,
    "performerEmail" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "reminderEmail24hSentAt" TIMESTAMP(3),
    "reminderEmail2hSentAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountType" "PasswordResetAccountType" NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimitCounter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimitCounter_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "MarketingJob" (
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

-- CreateTable
CREATE TABLE "MarketingContact" (
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

-- CreateTable
CREATE TABLE "MarketingOutreachDraft" (
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

-- CreateTable
CREATE TABLE "MarketingEmailSend" (
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
CREATE UNIQUE INDEX "VenueOwner_email_key" ON "VenueOwner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_googlePlaceId_key" ON "Venue"("googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueManager_email_key" ON "VenueManager"("email");

-- CreateIndex
CREATE INDEX "VenueManagerAccess_managerId_idx" ON "VenueManagerAccess"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueManagerAccess_venueId_managerId_key" ON "VenueManagerAccess"("venueId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicianUser_email_key" ON "MusicianUser"("email");

-- CreateIndex
CREATE INDEX "VenuePerformerHistory_venueId_lastUsedAt_idx" ON "VenuePerformerHistory"("venueId", "lastUsedAt" DESC);

-- CreateIndex
CREATE INDEX "VenuePerformerHistory_venueId_kind_idx" ON "VenuePerformerHistory"("venueId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "VenuePerformerHistory_venueId_kind_key_key" ON "VenuePerformerHistory"("venueId", "kind", "key");

-- CreateIndex
CREATE INDEX "MusicianPastVenue_venueId_idx" ON "MusicianPastVenue"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicianPastVenue_musicianId_venueId_key" ON "MusicianPastVenue"("musicianId", "venueId");

-- CreateIndex
CREATE INDEX "MusicianVenueInterest_venueId_idx" ON "MusicianVenueInterest"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicianVenueInterest_musicianId_venueId_key" ON "MusicianVenueInterest"("musicianId", "venueId");

-- CreateIndex
CREATE INDEX "EventTemplate_venueId_weekday_idx" ON "EventTemplate"("venueId", "weekday");

-- CreateIndex
CREATE INDEX "EventInstance_date_idx" ON "EventInstance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EventInstance_templateId_date_key" ON "EventInstance"("templateId", "date");

-- CreateIndex
CREATE INDEX "Slot_instanceId_status_idx" ON "Slot"("instanceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_instanceId_startMin_key" ON "Slot"("instanceId", "startMin");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotId_key" ON "Booking"("slotId");

-- CreateIndex
CREATE INDEX "Booking_musicianId_idx" ON "Booking"("musicianId");

-- CreateIndex
CREATE INDEX "Booking_cancelledAt_reminderEmail24hSentAt_idx" ON "Booking"("cancelledAt", "reminderEmail24hSentAt");

-- CreateIndex
CREATE INDEX "Booking_cancelledAt_reminderEmail2hSentAt_idx" ON "Booking"("cancelledAt", "reminderEmail2hSentAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_accountType_idx" ON "PasswordResetToken"("email", "accountType");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthRateLimitCounter_updatedAt_idx" ON "AuthRateLimitCounter"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthRateLimitCounter_key_bucket_key" ON "AuthRateLimitCounter"("key", "bucket");

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
CREATE UNIQUE INDEX "MarketingJob_idempotencyKey_key" ON "MarketingJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingJob_status_runAfter_idx" ON "MarketingJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "MarketingJob_kind_status_idx" ON "MarketingJob"("kind", "status");

-- CreateIndex
CREATE INDEX "MarketingJob_venueId_idx" ON "MarketingJob"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContact_emailNormalized_key" ON "MarketingContact"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContact_unsubscribeTokenHash_key" ON "MarketingContact"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "MarketingContact_discoveryMarketSlug_idx" ON "MarketingContact"("discoveryMarketSlug");

-- CreateIndex
CREATE INDEX "MarketingContact_suppressedAt_idx" ON "MarketingContact"("suppressedAt");

-- CreateIndex
CREATE INDEX "MarketingContact_marketingUnsubscribedAt_idx" ON "MarketingContact"("marketingUnsubscribedAt");

-- CreateIndex
CREATE INDEX "MarketingContact_status_idx" ON "MarketingContact"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingOutreachDraft_marketingEmailSendId_key" ON "MarketingOutreachDraft"("marketingEmailSendId");

-- CreateIndex
CREATE INDEX "MarketingOutreachDraft_venueId_status_idx" ON "MarketingOutreachDraft"("venueId", "status");

-- CreateIndex
CREATE INDEX "MarketingOutreachDraft_status_createdAt_idx" ON "MarketingOutreachDraft"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailSend_idempotencyKey_key" ON "MarketingEmailSend"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_contactId_createdAt_idx" ON "MarketingEmailSend"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_category_sentAt_idx" ON "MarketingEmailSend"("category", "sentAt");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_toDomain_sentAt_idx" ON "MarketingEmailSend"("toDomain", "sentAt");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_status_createdAt_idx" ON "MarketingEmailSend"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_templateKind_idx" ON "MarketingEmailSend"("templateKind");

-- CreateIndex
CREATE INDEX "MarketingProviderWebhookEvent_provider_createdAt_idx" ON "MarketingProviderWebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingProviderWebhookEvent_processedAt_idx" ON "MarketingProviderWebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailSuppression_emailNormalized_key" ON "MarketingEmailSuppression"("emailNormalized");

-- CreateIndex
CREATE INDEX "MarketingEmailSuppression_reason_idx" ON "MarketingEmailSuppression"("reason");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VenueOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueManagerAccess" ADD CONSTRAINT "VenueManagerAccess_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueManagerAccess" ADD CONSTRAINT "VenueManagerAccess_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "VenueManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_linkedMusicianId_fkey" FOREIGN KEY ("linkedMusicianId") REFERENCES "MusicianUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicianPastVenue" ADD CONSTRAINT "MusicianPastVenue_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicianPastVenue" ADD CONSTRAINT "MusicianPastVenue_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicianVenueInterest" ADD CONSTRAINT "MusicianVenueInterest_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicianVenueInterest" ADD CONSTRAINT "MusicianVenueInterest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInstance" ADD CONSTRAINT "EventInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EventInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MarketingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOutreachDraft" ADD CONSTRAINT "MarketingOutreachDraft_marketingEmailSendId_fkey" FOREIGN KEY ("marketingEmailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
