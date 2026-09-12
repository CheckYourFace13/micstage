-- Additive milestone timestamps for true signup cohorts (non-destructive).
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "signupStartedAt" TIMESTAMP(3);
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "accountCreatedAt" TIMESTAMP(3);
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "listingLiveAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "GrowthLead_signupStartedAt_idx" ON "GrowthLead"("signupStartedAt");
CREATE INDEX IF NOT EXISTS "GrowthLead_accountCreatedAt_idx" ON "GrowthLead"("accountCreatedAt");
