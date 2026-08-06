-- Additive: instant claim tokens, claim audit, evidence enrichment fields.
-- Does not delete or transform existing account/listing data.

-- Enums
CREATE TYPE "ListingClaimInviteTokenStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ListingClaimDecision" AS ENUM ('AUTO_APPROVED', 'MANUAL_REVIEW', 'REJECTED');
CREATE TYPE "ListingEvidenceAutomationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'NEEDS_HUMAN', 'PROMOTED', 'REJECTED', 'TERMINAL');
CREATE TYPE "ListingOpenMicEvidenceSourceType" AS ENUM ('OFFICIAL_WEBSITE', 'OFFICIAL_EVENTS_PAGE', 'OFFICIAL_SOCIAL', 'HOST_PAGE', 'STRUCTURED_EVENT_PROVIDER', 'ALTERNATE_SEARCH', 'OTHER');

-- Listing automation + invite telemetry columns
ALTER TABLE "PublicOpenMicListing"
  ADD COLUMN IF NOT EXISTS "claimInviteProviderMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "placeVerifyAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "placeVerifyLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "placeVerifyNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "evidenceEnrichAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "evidenceEnrichLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "evidenceEnrichNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "evidenceTerminalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceAutomationStatus" "ListingEvidenceAutomationStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "PublicOpenMicListing_placeVerifyNextAttemptAt_googlePlaceId_idx"
  ON "PublicOpenMicListing"("placeVerifyNextAttemptAt", "googlePlaceId");
CREATE INDEX IF NOT EXISTS "PublicOpenMicListing_evidenceEnrichNext_verification_idx"
  ON "PublicOpenMicListing"("evidenceEnrichNextAttemptAt", "verificationStatus");
CREATE INDEX IF NOT EXISTS "PublicOpenMicListing_evidenceAutomationStatus_updatedAt_idx"
  ON "PublicOpenMicListing"("evidenceAutomationStatus", "updatedAt");

-- Claim invite tokens
CREATE TABLE "ListingClaimInviteToken" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "listingId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "intendedEmailNormalized" TEXT NOT NULL,
  "status" "ListingClaimInviteTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ListingClaimInviteToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingClaimInviteToken_tokenHash_key" ON "ListingClaimInviteToken"("tokenHash");
CREATE INDEX "ListingClaimInviteToken_listingId_status_idx" ON "ListingClaimInviteToken"("listingId", "status");
CREATE INDEX "ListingClaimInviteToken_intendedEmailNormalized_idx" ON "ListingClaimInviteToken"("intendedEmailNormalized");
CREATE INDEX "ListingClaimInviteToken_expiresAt_idx" ON "ListingClaimInviteToken"("expiresAt");

ALTER TABLE "ListingClaimInviteToken"
  ADD CONSTRAINT "ListingClaimInviteToken_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Claim audit events
CREATE TABLE "ListingClaimAuditEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "listingId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "meta" JSONB,
  CONSTRAINT "ListingClaimAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingClaimAuditEvent_listingId_createdAt_idx" ON "ListingClaimAuditEvent"("listingId", "createdAt");
CREATE INDEX "ListingClaimAuditEvent_eventType_createdAt_idx" ON "ListingClaimAuditEvent"("eventType", "createdAt");

ALTER TABLE "ListingClaimAuditEvent"
  ADD CONSTRAINT "ListingClaimAuditEvent_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Open-mic evidence rows
CREATE TABLE "ListingOpenMicEvidence" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "listingId" TEXT NOT NULL,
  "evidenceUrl" TEXT NOT NULL,
  "sourceType" "ListingOpenMicEvidenceSourceType" NOT NULL,
  "evidenceTitle" TEXT,
  "evidenceExcerpt" TEXT,
  "detectedPhrase" TEXT,
  "detectedSchedule" TEXT,
  "evidenceDate" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trusted" BOOLEAN NOT NULL DEFAULT false,
  "reviewOnly" BOOLEAN NOT NULL DEFAULT true,
  "reasonCode" TEXT,
  CONSTRAINT "ListingOpenMicEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingOpenMicEvidence_listingId_trusted_idx" ON "ListingOpenMicEvidence"("listingId", "trusted");
CREATE INDEX "ListingOpenMicEvidence_listingId_fetchedAt_idx" ON "ListingOpenMicEvidence"("listingId", "fetchedAt");
CREATE UNIQUE INDEX "ListingOpenMicEvidence_listingId_evidenceUrl_key" ON "ListingOpenMicEvidence"("listingId", "evidenceUrl");

ALTER TABLE "ListingOpenMicEvidence"
  ADD CONSTRAINT "ListingOpenMicEvidence_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extend ListingClaimRequest for instant claim
ALTER TABLE "ListingClaimRequest"
  ADD COLUMN IF NOT EXISTS "authorityConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decision" "ListingClaimDecision",
  ADD COLUMN IF NOT EXISTS "decisionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "claimInviteTokenId" TEXT;

ALTER TABLE "ListingClaimRequest"
  ADD CONSTRAINT "ListingClaimRequest_claimInviteTokenId_fkey"
  FOREIGN KEY ("claimInviteTokenId") REFERENCES "ListingClaimInviteToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
