-- Discovery quality: resolve venue leads against Google Places instead of trusting page titles.
-- Additive only: new nullable columns + a new lookup cache table. No data is modified or dropped.

ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "googlePlaceVerifiedAt" TIMESTAMP(3);
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "placeCanonicalName" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "placeFormattedAddress" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "placeLat" DOUBLE PRECISION;
ALTER TABLE "GrowthLead" ADD COLUMN IF NOT EXISTS "placeLng" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "GrowthLead_googlePlaceId_idx" ON "GrowthLead"("googlePlaceId");

-- Cached Google Places resolutions so repeated discovery runs never re-spend a paid lookup.
CREATE TABLE IF NOT EXISTS "GrowthPlaceLookup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "matchScore" DOUBLE PRECISION,
    "placeId" TEXT,
    "canonicalName" TEXT,
    "formattedAddress" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "website" TEXT,
    "websiteHost" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrowthPlaceLookup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GrowthPlaceLookup_lookupKey_key" ON "GrowthPlaceLookup"("lookupKey");
CREATE INDEX IF NOT EXISTS "GrowthPlaceLookup_placeId_idx" ON "GrowthPlaceLookup"("placeId");
CREATE INDEX IF NOT EXISTS "GrowthPlaceLookup_outcome_idx" ON "GrowthPlaceLookup"("outcome");
CREATE INDEX IF NOT EXISTS "GrowthPlaceLookup_updatedAt_idx" ON "GrowthPlaceLookup"("updatedAt");

-- Internal-only table: keep it out of the public API surface like other growth tables.
ALTER TABLE "GrowthPlaceLookup" ENABLE ROW LEVEL SECURITY;
