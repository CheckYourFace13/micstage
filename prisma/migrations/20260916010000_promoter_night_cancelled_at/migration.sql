-- Additive: soft-cancel Host nights without destroying booking history.
ALTER TABLE "PromoterNight" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PromoterNight_cancelledAt_idx" ON "PromoterNight"("cancelledAt");
