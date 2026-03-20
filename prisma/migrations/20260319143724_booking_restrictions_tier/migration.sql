-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Venue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "lat" REAL,
    "lng" REAL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "about" TEXT,
    "logoUrl" TEXT,
    "imagePrimaryUrl" TEXT,
    "imageSecondaryUrl" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "twitterUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "soundcloudUrl" TEXT,
    "seriesStartDate" DATETIME,
    "seriesEndDate" DATETIME,
    "bookingOpensDaysAhead" INTEGER NOT NULL DEFAULT 60,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE',
    "bookingRestrictionMode" TEXT NOT NULL DEFAULT 'NONE',
    "restrictionHoursBefore" INTEGER NOT NULL DEFAULT 6,
    "onPremiseMaxDistanceMeters" INTEGER NOT NULL DEFAULT 1000,
    "performanceFormat" TEXT NOT NULL DEFAULT 'OPEN_VARIETY',
    "providesPA" BOOLEAN NOT NULL DEFAULT false,
    "providesSpeakersMics" BOOLEAN NOT NULL DEFAULT false,
    "providesMonitors" BOOLEAN NOT NULL DEFAULT false,
    "providesDrumKit" BOOLEAN NOT NULL DEFAULT false,
    "providesBassAmp" BOOLEAN NOT NULL DEFAULT false,
    "providesGuitarAmp" BOOLEAN NOT NULL DEFAULT false,
    "providesKeyboard" BOOLEAN NOT NULL DEFAULT false,
    "providesDiBox" BOOLEAN NOT NULL DEFAULT false,
    "providesLightingBasic" BOOLEAN NOT NULL DEFAULT false,
    "providesBacklineShared" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VenueOwner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Venue" ("about", "bookingOpensDaysAhead", "city", "country", "createdAt", "facebookUrl", "formattedAddress", "googlePlaceId", "id", "imagePrimaryUrl", "imageSecondaryUrl", "instagramUrl", "lat", "lng", "logoUrl", "name", "ownerId", "performanceFormat", "providesBacklineShared", "providesBassAmp", "providesDiBox", "providesDrumKit", "providesGuitarAmp", "providesKeyboard", "providesLightingBasic", "providesMonitors", "providesPA", "providesSpeakersMics", "region", "seriesEndDate", "seriesStartDate", "slug", "soundcloudUrl", "tiktokUrl", "timeZone", "twitterUrl", "updatedAt", "websiteUrl", "youtubeUrl") SELECT "about", "bookingOpensDaysAhead", "city", "country", "createdAt", "facebookUrl", "formattedAddress", "googlePlaceId", "id", "imagePrimaryUrl", "imageSecondaryUrl", "instagramUrl", "lat", "lng", "logoUrl", "name", "ownerId", "performanceFormat", "providesBacklineShared", "providesBassAmp", "providesDiBox", "providesDrumKit", "providesGuitarAmp", "providesKeyboard", "providesLightingBasic", "providesMonitors", "providesPA", "providesSpeakersMics", "region", "seriesEndDate", "seriesStartDate", "slug", "soundcloudUrl", "tiktokUrl", "timeZone", "twitterUrl", "updatedAt", "websiteUrl", "youtubeUrl" FROM "Venue";
DROP TABLE "Venue";
ALTER TABLE "new_Venue" RENAME TO "Venue";
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");
CREATE UNIQUE INDEX "Venue_googlePlaceId_key" ON "Venue"("googlePlaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
