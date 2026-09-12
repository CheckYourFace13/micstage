-- Additive registration funnel milestones (non-destructive).
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "registrationViewedAt" TIMESTAMP(3);
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "registrationSubmittedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "GrowthLead_registrationViewedAt_idx" ON "GrowthLead"("registrationViewedAt");
CREATE INDEX IF NOT EXISTS "GrowthLead_registrationSubmittedAt_idx" ON "GrowthLead"("registrationSubmittedAt");
