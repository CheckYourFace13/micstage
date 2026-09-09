-- Google Maps Platform retention + non-Google map pin sourcing.
--
-- Places terms let us keep a place_id indefinitely, cap cached coordinates at 30 days, and
-- forbid showing Places content alongside a non-Google map (our public map is OpenStreetMap).
-- These columns let us track provenance and expire Google content on schedule.

ALTER TABLE "GrowthPlaceLookup"
  ADD COLUMN "coordsVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "googleContentExpiresAt" TIMESTAMP(3);

CREATE INDEX "GrowthPlaceLookup_googleContentExpiresAt_idx"
  ON "GrowthPlaceLookup"("googleContentExpiresAt");

-- Existing cache rows resolved against Google, so record that coordinates existed before the
-- content itself is purged, and give each row a concrete expiry.
UPDATE "GrowthPlaceLookup"
  SET "coordsVerified" = true
  WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL;

UPDATE "GrowthPlaceLookup"
  SET "googleContentExpiresAt" = "updatedAt" + INTERVAL '30 days'
  WHERE "lat" IS NOT NULL;

ALTER TABLE "PublicOpenMicListing"
  ADD COLUMN "coordSource" TEXT,
  ADD COLUMN "coordsUpdatedAt" TIMESTAMP(3);

CREATE INDEX "PublicOpenMicListing_coordSource_idx"
  ON "PublicOpenMicListing"("coordSource");

-- Every coordinate stored so far came from Places verification. Mark it so the re-sourcing job
-- replaces it with public-domain geocoder output and the retention job can purge leftovers.
UPDATE "PublicOpenMicListing"
  SET "coordSource" = 'google'
  WHERE "lat" IS NOT NULL AND "coordSource" IS NULL;
