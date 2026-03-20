-- Redefine home base fields: add Google/geo + travel radii; keep home_city / home_region columns.
-- SQLite: ALTER TABLE ADD COLUMN only.

ALTER TABLE "MusicianUser" ADD COLUMN "homeGooglePlaceId" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "homeFormattedAddress" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "homeLat" REAL;
ALTER TABLE "MusicianUser" ADD COLUMN "homeLng" REAL;
ALTER TABLE "MusicianUser" ADD COLUMN "travelRadiusMiles" INTEGER;

ALTER TABLE "MusicianUser" ADD COLUMN "secondaryGooglePlaceId" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryFormattedAddress" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryLat" REAL;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryLng" REAL;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryCity" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryRegion" TEXT;
ALTER TABLE "MusicianUser" ADD COLUMN "secondaryRadiusMiles" INTEGER;
