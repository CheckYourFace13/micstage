-- Self-service open-mic removal (soft). Preserves accounts, venues, and history.
ALTER TABLE "PromoterSeries" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PromoterSeries_promoterId_archivedAt_idx" ON "PromoterSeries"("promoterId", "archivedAt");

ALTER TABLE "PublicOpenMicListing" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PublicOpenMicListing_removedAt_idx" ON "PublicOpenMicListing"("removedAt");
