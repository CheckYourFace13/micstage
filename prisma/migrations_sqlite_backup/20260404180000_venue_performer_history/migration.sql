-- CreateEnum
CREATE TYPE "VenuePerformerHistoryKind" AS ENUM ('MUSICIAN', 'MANUAL');

-- CreateTable
CREATE TABLE "VenuePerformerHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venueId" TEXT NOT NULL,
    "kind" "VenuePerformerHistoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "musicianId" TEXT,
    "displayName" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "showOnPublicProfile" BOOLEAN NOT NULL DEFAULT true,
    "linkedMusicianId" TEXT,

    CONSTRAINT "VenuePerformerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenuePerformerHistory_venueId_lastUsedAt_idx" ON "VenuePerformerHistory"("venueId", "lastUsedAt" DESC);

-- CreateIndex
CREATE INDEX "VenuePerformerHistory_venueId_kind_idx" ON "VenuePerformerHistory"("venueId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "VenuePerformerHistory_venueId_kind_key_key" ON "VenuePerformerHistory"("venueId", "kind", "key");

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePerformerHistory" ADD CONSTRAINT "VenuePerformerHistory_linkedMusicianId_fkey" FOREIGN KEY ("linkedMusicianId") REFERENCES "MusicianUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
