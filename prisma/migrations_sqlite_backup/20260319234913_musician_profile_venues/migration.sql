-- CreateTable
CREATE TABLE "MusicianPastVenue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "musicianId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    CONSTRAINT "MusicianPastVenue_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MusicianPastVenue_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MusicianVenueInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "musicianId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    CONSTRAINT "MusicianVenueInterest_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MusicianVenueInterest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MusicianUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "bio" TEXT,
    "websiteUrl" TEXT,
    "imageUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "twitterUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "soundcloudUrl" TEXT,
    "specializations" JSONB,
    "instruments" JSONB,
    "yearsPlaying" INTEGER,
    "openToHire" BOOLEAN NOT NULL DEFAULT false,
    "hireRateDescription" TEXT,
    "setLengthMinutes" INTEGER,
    "collaborationsText" TEXT,
    "homeCity" TEXT,
    "homeRegion" TEXT
);
INSERT INTO "new_MusicianUser" ("createdAt", "email", "id", "passwordHash", "stageName", "updatedAt") SELECT "createdAt", "email", "id", "passwordHash", "stageName", "updatedAt" FROM "MusicianUser";
DROP TABLE "MusicianUser";
ALTER TABLE "new_MusicianUser" RENAME TO "MusicianUser";
CREATE UNIQUE INDEX "MusicianUser_email_key" ON "MusicianUser"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MusicianPastVenue_venueId_idx" ON "MusicianPastVenue"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicianPastVenue_musicianId_venueId_key" ON "MusicianPastVenue"("musicianId", "venueId");

-- CreateIndex
CREATE INDEX "MusicianVenueInterest_venueId_idx" ON "MusicianVenueInterest"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicianVenueInterest_musicianId_venueId_key" ON "MusicianVenueInterest"("musicianId", "venueId");
