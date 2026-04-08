-- Venue-first discovery metadata + acquisition funnel (optional fields; defaults safe for existing rows)

CREATE TYPE "GrowthLeadOpenMicSignalTier" AS ENUM ('EXPLICIT_OPEN_MIC', 'STRONG_LIVE_EVENT', 'WEAK_INFERRED');
CREATE TYPE "GrowthLeadContactQuality" AS ENUM ('EMAIL', 'CONTACT_PAGE', 'SOCIAL_OR_CALENDAR', 'WEBSITE_ONLY');
CREATE TYPE "GrowthLeadAcquisitionStage" AS ENUM (
  'DISCOVERED',
  'OUTREACH_DRAFTED',
  'OUTREACH_SENT',
  'CLICKED',
  'SIGNUP_STARTED',
  'ACCOUNT_CREATED',
  'LISTING_LIVE'
);

ALTER TABLE "GrowthLead" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN "openMicSignalTier" "GrowthLeadOpenMicSignalTier";
ALTER TABLE "GrowthLead" ADD COLUMN "contactQuality" "GrowthLeadContactQuality";
ALTER TABLE "GrowthLead" ADD COLUMN "acquisitionStage" "GrowthLeadAcquisitionStage" NOT NULL DEFAULT 'DISCOVERED';

CREATE INDEX "GrowthLead_openMicSignalTier_idx" ON "GrowthLead"("openMicSignalTier");
CREATE INDEX "GrowthLead_contactQuality_idx" ON "GrowthLead"("contactQuality");
CREATE INDEX "GrowthLead_acquisitionStage_idx" ON "GrowthLead"("acquisitionStage");
CREATE INDEX "GrowthLead_leadType_openMicSignalTier_idx" ON "GrowthLead"("leadType", "openMicSignalTier");
