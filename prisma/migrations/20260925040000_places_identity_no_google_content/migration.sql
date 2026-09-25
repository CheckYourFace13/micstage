-- Stop storing Google Place Details content. Place IDs stay. Lat/lng are not kept here.
ALTER TABLE "PlacesQueryIdentity" DROP COLUMN IF EXISTS "tempPayload";
ALTER TABLE "PlacesQueryIdentity" DROP COLUMN IF EXISTS "googleContentExpiresAt";
ALTER TABLE "PlacesQueryIdentity" DROP COLUMN IF EXISTS "derivedVenueTypeOk";
ALTER TABLE "PlacesQueryIdentity" DROP COLUMN IF EXISTS "derivedInUnitedStates";
ALTER TABLE "PlacesQueryIdentity" DROP COLUMN IF EXISTS "derivedBusinessActive";
DROP INDEX IF EXISTS "PlacesQueryIdentity_googleContentExpiresAt_idx";
