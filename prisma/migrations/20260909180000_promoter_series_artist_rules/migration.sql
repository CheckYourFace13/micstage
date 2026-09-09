-- Host-facing performer instructions, shared across nights in a series.
ALTER TABLE "PromoterSeries" ADD COLUMN IF NOT EXISTS "artistRules" TEXT;
