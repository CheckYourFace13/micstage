-- MicStage audit stamp only. No Google response content.
ALTER TABLE "PublicOpenMicListing" ADD COLUMN IF NOT EXISTS "googlePlaceDetailsCheckedAt" TIMESTAMP(3);
