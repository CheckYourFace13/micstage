-- CreateEnum
CREATE TYPE "MessageSenderSide" AS ENUM ('VENUE', 'MUSICIAN');

-- AlterTable
ALTER TABLE "MusicianUser" ADD COLUMN "weeklyNearbyOpenMicAlerts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MusicianUser" ADD COLUMN "weeklyNearbyDigestLastSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "lastReadByMusicianAt" TIMESTAMP(3),
    "lastReadByVenueAt" TIMESTAMP(3),

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderSide" "MessageSenderSide" NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_venueId_musicianId_key" ON "MessageThread"("venueId", "musicianId");

-- CreateIndex
CREATE INDEX "MessageThread_musicianId_lastMessageAt_idx" ON "MessageThread"("musicianId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "MessageThread_venueId_lastMessageAt_idx" ON "MessageThread"("venueId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
