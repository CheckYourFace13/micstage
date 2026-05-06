-- CreateEnum
CREATE TYPE "PromoterVenueAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- CreateTable
CREATE TABLE "PromoterUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "registrationContentConsentAt" TIMESTAMP(3),
    "registrationContentConsentVersion" TEXT,
    "applicationId" TEXT,

    CONSTRAINT "PromoterUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterSeries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "promoterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PromoterSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterVenueAccess" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "promoterId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "status" "PromoterVenueAccessStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PromoterVenueAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterNight" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seriesId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "notes" TEXT,

    CONSTRAINT "PromoterNight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoterUser_email_key" ON "PromoterUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterUser_applicationId_key" ON "PromoterUser"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterSeries_promoterId_slug_key" ON "PromoterSeries"("promoterId", "slug");

-- CreateIndex
CREATE INDEX "PromoterSeries_promoterId_updatedAt_idx" ON "PromoterSeries"("promoterId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterVenueAccess_promoterId_venueId_key" ON "PromoterVenueAccess"("promoterId", "venueId");

-- CreateIndex
CREATE INDEX "PromoterVenueAccess_venueId_status_idx" ON "PromoterVenueAccess"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterNight_seriesId_venueId_date_key" ON "PromoterNight"("seriesId", "venueId", "date");

-- CreateIndex
CREATE INDEX "PromoterNight_seriesId_date_idx" ON "PromoterNight"("seriesId", "date");

-- CreateIndex
CREATE INDEX "PromoterNight_venueId_date_idx" ON "PromoterNight"("venueId", "date");

-- AddForeignKey
ALTER TABLE "PromoterUser" ADD CONSTRAINT "PromoterUser_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PromoterApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterSeries" ADD CONSTRAINT "PromoterSeries_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "PromoterUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterVenueAccess" ADD CONSTRAINT "PromoterVenueAccess_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "PromoterUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterVenueAccess" ADD CONSTRAINT "PromoterVenueAccess_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterNight" ADD CONSTRAINT "PromoterNight_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "PromoterSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterNight" ADD CONSTRAINT "PromoterNight_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
