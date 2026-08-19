-- Host night as canonical event identity: signup settings + host-owned templates + venue disputes.

ALTER TABLE "PromoterNight" ADD COLUMN "signupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PromoterNight" ADD COLUMN "startTimeMin" INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE "PromoterNight" ADD COLUMN "endTimeMin" INTEGER NOT NULL DEFAULT 1380;
ALTER TABLE "PromoterNight" ADD COLUMN "slotMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "PromoterNight" ADD COLUMN "breakMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "EventTemplate" ADD COLUMN "promoterNightId" TEXT;
CREATE UNIQUE INDEX "EventTemplate_promoterNightId_key" ON "EventTemplate"("promoterNightId");
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_promoterNightId_fkey" FOREIGN KEY ("promoterNightId") REFERENCES "PromoterNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "HostNightDisputeStatus" AS ENUM ('PENDING', 'REVIEWED', 'SUPPRESSED', 'DISMISSED');

CREATE TABLE "HostNightVenueDispute" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "promoterNightId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "HostNightDisputeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reporterEmail" TEXT,
    "reporterVenueOwnerId" TEXT,

    CONSTRAINT "HostNightVenueDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HostNightVenueDispute_promoterNightId_idx" ON "HostNightVenueDispute"("promoterNightId");
CREATE INDEX "HostNightVenueDispute_venueId_status_idx" ON "HostNightVenueDispute"("venueId", "status");

ALTER TABLE "HostNightVenueDispute" ADD CONSTRAINT "HostNightVenueDispute_promoterNightId_fkey" FOREIGN KEY ("promoterNightId") REFERENCES "PromoterNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostNightVenueDispute" ADD CONSTRAINT "HostNightVenueDispute_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
