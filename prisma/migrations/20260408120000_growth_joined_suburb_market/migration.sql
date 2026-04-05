-- Growth: JOINED conversion status + suburb line (Chicagoland / market-first ops)

ALTER TYPE "GrowthLeadStatus" ADD VALUE IF NOT EXISTS 'JOINED';

ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "suburb" TEXT;

CREATE INDEX IF NOT EXISTS "GrowthLead_suburb_idx" ON "GrowthLead"("suburb");
