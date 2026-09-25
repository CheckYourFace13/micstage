CREATE TABLE IF NOT EXISTS "PlacesQueryIdentity" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "logicalKey" TEXT NOT NULL,
  "placeId" TEXT,
  "responseClass" TEXT,
  "retryAfter" TIMESTAMP(3),
  "permanentBlock" BOOLEAN NOT NULL DEFAULT false,
  "derivedVenueTypeOk" BOOLEAN,
  "derivedInUnitedStates" BOOLEAN,
  "derivedBusinessActive" BOOLEAN,
  "tempPayload" JSONB,
  "googleContentExpiresAt" TIMESTAMP(3),
  CONSTRAINT "PlacesQueryIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlacesQueryIdentity_logicalKey_key" ON "PlacesQueryIdentity"("logicalKey");
CREATE INDEX IF NOT EXISTS "PlacesQueryIdentity_retryAfter_idx" ON "PlacesQueryIdentity"("retryAfter");
CREATE INDEX IF NOT EXISTS "PlacesQueryIdentity_googleContentExpiresAt_idx" ON "PlacesQueryIdentity"("googleContentExpiresAt");
ALTER TABLE "PlacesQueryIdentity" ENABLE ROW LEVEL SECURITY;
